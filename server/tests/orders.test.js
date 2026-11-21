const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { resetAndSeed } = require('../src/seed');

// Fixture mirrors the brief's acceptance examples: A has 5 units, B has 0.
const FIXTURE = [
  { sku: 'A', name: 'Product A', price_paise: 10000, stock: 5 },
  { sku: 'B', name: 'Product B', price_paise: 25000, stock: 0 },
  { sku: 'C', name: 'Product C', price_paise: 5000, stock: 3 },
];
const A = 1;
const B = 2;
const C = 3;

let db;
let app;

beforeEach(() => {
  db = openDb(':memory:');
  resetAndSeed(db, FIXTURE);
  app = createApp(db);
});
afterEach(() => db.close());

const stockOf = async (id) => (await request(app).get('/api/products')).body.find((p) => p.id === id).stock;
const orderCount = () => db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
const place = (items, extra = {}) => request(app).post('/api/orders').send({ customerName: 'Asha', items, ...extra });
const move = (id, status) => request(app).post(`/api/orders/${id}/status`).send({ status });

describe('placing orders', () => {
  test('successful placement deducts stock, computes total and starts in PLACED', async () => {
    const res = await place([
      { productId: A, quantity: 2 },
      { productId: C, quantity: 1 },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.reference).toBe('ORD-00001');
    expect(res.body.status).toBe('PLACED');
    expect(res.body.totalPaise).toBe(2 * 10000 + 5000);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.allowedTransitions).toEqual(['PACKED', 'CANCELLED']);
    expect(await stockOf(A)).toBe(3);
    expect(await stockOf(C)).toBe(2);

    const fetched = await request(app).get('/api/orders/ORD-00001');
    expect(fetched.status).toBe(200);
    expect(fetched.body.history.map((h) => h.toStatus)).toEqual(['PLACED']);
  });

  test('acceptance #1: one unavailable item rejects the whole order and leaves all stock unchanged', async () => {
    const res = await place([
      { productId: A, quantity: 2 },
      { productId: B, quantity: 1 },
    ]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([{ productId: B, name: 'Product B', requested: 1, available: 0 }]);
    expect(await stockOf(A)).toBe(5);
    expect(await stockOf(B)).toBe(0);
    expect(orderCount()).toBe(0);
  });

  test('requesting more than available is rejected (duplicate lines are summed)', async () => {
    const res = await place([
      { productId: C, quantity: 2 },
      { productId: C, quantity: 2 },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.details[0]).toMatchObject({ requested: 4, available: 3 });
    expect(await stockOf(C)).toBe(3);
  });

  test.each([
    ['no items', { customerName: 'Asha', items: [] }],
    ['zero quantity', { customerName: 'Asha', items: [{ productId: A, quantity: 0 }] }],
    ['fractional quantity', { customerName: 'Asha', items: [{ productId: A, quantity: 1.5 }] }],
    ['string quantity', { customerName: 'Asha', items: [{ productId: A, quantity: '2' }] }],
    ['missing customer', { items: [{ productId: A, quantity: 1 }] }],
    ['bad phone', { customerName: 'Asha', customerPhone: 'call me', items: [{ productId: A, quantity: 1 }] }],
  ])('rejects invalid payload: %s', async (_label, body) => {
    const res = await request(app).post('/api/orders').send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await stockOf(A)).toBe(5);
    expect(orderCount()).toBe(0);
  });

  test('rejects unknown products without touching stock', async () => {
    const res = await place([
      { productId: A, quantity: 1 },
      { productId: 999, quantity: 1 },
    ]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_PRODUCT');
    expect(await stockOf(A)).toBe(5);
  });

  test('rejects malformed JSON', async () => {
    const res = await request(app).post('/api/orders').set('Content-Type', 'application/json').send('{"items": [');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });

  test('double submit with the same Idempotency-Key creates one order and deducts stock once', async () => {
    const body = { customerName: 'Asha', items: [{ productId: A, quantity: 2 }] };
    const first = await request(app).post('/api/orders').set('Idempotency-Key', 'k-1').send(body);
    const second = await request(app).post('/api/orders').set('Idempotency-Key', 'k-1').send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);
    expect(orderCount()).toBe(1);
    expect(await stockOf(A)).toBe(3);
  });

  test('concurrent orders for scarce stock never oversell', async () => {
    // C has 3 units; fire 10 simultaneous single-unit orders.
    const results = await Promise.all(Array.from({ length: 10 }, () => place([{ productId: C, quantity: 1 }])));
    const statuses = results.map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(await stockOf(C)).toBe(0);
    expect(orderCount()).toBe(3);
  });
});

describe('fulfilment state machine', () => {
  let order;
  beforeEach(async () => {
    order = (await place([{ productId: A, quantity: 2 }])).body;
  });

  test('happy path PLACED -> PACKED -> SHIPPED records history', async () => {
    expect((await move(order.id, 'PACKED')).body.status).toBe('PACKED');
    const shipped = await move(order.id, 'SHIPPED');
    expect(shipped.status).toBe(200);
    expect(shipped.body.status).toBe('SHIPPED');
    expect(shipped.body.allowedTransitions).toEqual([]);
    expect(shipped.body.history.map((h) => h.toStatus)).toEqual(['PLACED', 'PACKED', 'SHIPPED']);
  });

  test('invalid state change: skipping PLACED -> SHIPPED is rejected by the server', async () => {
    const res = await move(order.id, 'SHIPPED');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.details).toEqual({ from: 'PLACED', to: 'SHIPPED', allowed: ['PACKED', 'CANCELLED'] });
    expect((await request(app).get(`/api/orders/${order.id}`)).body.status).toBe('PLACED');
  });

  test('invalid state change: a SHIPPED order cannot be cancelled and stock is not restored', async () => {
    await move(order.id, 'PACKED');
    await move(order.id, 'SHIPPED');
    const res = await move(order.id, 'CANCELLED');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(await stockOf(A)).toBe(3);
  });

  test('invalid state change: moving backwards (PACKED -> PLACED) is rejected', async () => {
    await move(order.id, 'PACKED');
    const res = await move(order.id, 'PLACED');
    expect(res.status).toBe(409);
  });

  test('unknown status value is a validation error', async () => {
    const res = await move(order.id, 'DELIVERED');
    expect(res.status).toBe(422);
  });

  test('acceptance #2: cancelling restores stock exactly once', async () => {
    expect(await stockOf(A)).toBe(3);

    const first = await move(order.id, 'CANCELLED');
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('CANCELLED');
    expect(await stockOf(A)).toBe(5);

    const again = await move(order.id, 'CANCELLED');
    expect(again.status).toBe(409);
    expect(await stockOf(A)).toBe(5);
  });

  test('concurrent duplicate cancels restore stock only once', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => move(order.id, 'CANCELLED')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await stockOf(A)).toBe(5);
  });

  test('cancelling from PACKED is allowed and restores stock', async () => {
    await move(order.id, 'PACKED');
    const res = await move(order.id, 'CANCELLED');
    expect(res.status).toBe(200);
    expect(await stockOf(A)).toBe(5);
  });

  test('404 for an unknown order', async () => {
    expect((await move(9999, 'PACKED')).status).toBe(404);
    expect((await request(app).get('/api/orders/ORD-99999')).status).toBe(404);
  });
});

describe('finding orders', () => {
  beforeEach(async () => {
    await place([{ productId: A, quantity: 1 }], { customerName: 'Ravi' }); // ORD-00001
    await place([{ productId: A, quantity: 1 }], { customerName: 'Meera' }); // ORD-00002
    await move(2, 'PACKED');
  });

  test('search by reference (case-insensitive, partial)', async () => {
    const res = await request(app).get('/api/orders').query({ q: 'ord-00002' });
    expect(res.body.map((o) => o.reference)).toEqual(['ORD-00002']);
  });

  test('filter by status', async () => {
    const res = await request(app).get('/api/orders').query({ status: 'PACKED' });
    expect(res.body.map((o) => o.reference)).toEqual(['ORD-00002']);
  });

  test('search wildcards are treated literally', async () => {
    const res = await request(app).get('/api/orders').query({ q: '%' });
    expect(res.body).toHaveLength(0);
  });

  test('invalid status filter is rejected', async () => {
    expect((await request(app).get('/api/orders').query({ status: 'LOST' })).status).toBe(422);
  });
});

describe('catalogue and dashboard stats', () => {
  test('products expose stock status computed on the server', async () => {
    const res = await request(app).get('/api/products');
    const status = Object.fromEntries(res.body.map((p) => [p.sku, p.stockStatus]));
    expect(status).toEqual({ A: 'LOW_STOCK', B: 'OUT_OF_STOCK', C: 'LOW_STOCK' });
  });

  test('stats reflect real order and stock data', async () => {
    const empty = (await request(app).get('/api/stats')).body;
    expect(empty.totalOrders).toBe(0);
    expect(empty.recentOrders).toEqual([]);

    const o1 = (await place([{ productId: A, quantity: 2 }])).body; // 20000
    const o2 = (await place([{ productId: C, quantity: 1 }])).body; // 5000
    await move(o1.id, 'PACKED');
    await move(o2.id, 'CANCELLED');

    const s = (await request(app).get('/api/stats')).body;
    expect(s.totalOrders).toBe(2);
    expect(s.ordersByStatus).toEqual({ PLACED: 0, PACKED: 1, SHIPPED: 0, CANCELLED: 1 });
    expect(s.revenuePaise).toBe(20000); // cancelled orders excluded
    expect(s.outOfStockCount).toBe(1);
    expect(s.lowStockCount).toBe(2); // A=3, C=3
    expect(s.inventory.totalUnits).toBe(3 + 0 + 3);
    expect(s.stockAlerts[0].sku).toBe('B');
    expect(s.recentOrders.map((o) => o.reference)).toEqual([o2.reference, o1.reference]);
    expect(s.ordersByDay).toHaveLength(14);
    expect(s.ordersByDay.at(-1)).toMatchObject({ orders: 2, revenuePaise: 20000 }); // today; cancelled excluded from revenue
    expect(s.ordersByDay.slice(0, -1).every((d) => d.orders === 0)).toBe(true);
  });
});

describe('migration', () => {
  test('a database created before categories existed is upgraded without losing data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orders-mig-'));
    const file = path.join(dir, 'old.db');
    const Database = require('better-sqlite3');
    const old = new Database(file);
    old.exec(`CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
                price_paise INTEGER NOT NULL, stock INTEGER NOT NULL);
              INSERT INTO products (sku, name, price_paise, stock) VALUES ('TEE-BLK-M', 'Tee', 59900, 7);
              INSERT INTO products (sku, name, price_paise, stock) VALUES ('VST-BLK-L', 'Puffer Vest – Black', 279900, 4);`);
    old.close();

    const upgraded = openDb(file);
    const { syncCatalogue } = require('../src/seed');
    syncCatalogue(upgraded);
    const tee = upgraded.prepare("SELECT category, stock FROM products WHERE sku = 'TEE-BLK-M'").get();
    const count = upgraded.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    const renamed = upgraded.prepare("SELECT id, name, stock FROM products WHERE sku = 'BLZ-BLK-L'").get();
    const legacy = upgraded.prepare("SELECT COUNT(*) AS n FROM products WHERE sku = 'VST-BLK-L'").get().n;
    upgraded.close();
    fs.rmSync(dir, { recursive: true, force: true });

    expect(tee).toEqual({ category: 'Apparel', stock: 7 }); // stock preserved, category filled in
    expect(renamed).toEqual({ id: 2, name: 'Tailored Blazer – Black', stock: 4 }); // renamed in place, same id and stock
    expect(legacy).toBe(0);
    expect(count).toBe(12);
  });
});

describe('persistence', () => {
  test('orders and stock survive an app restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orders-'));
    const file = path.join(dir, 'test.db');

    let fileDb = openDb(file);
    resetAndSeed(fileDb, FIXTURE);
    const created = await request(createApp(fileDb))
      .post('/api/orders')
      .send({ customerName: 'Asha', items: [{ productId: A, quantity: 2 }] });
    expect(created.status).toBe(201);
    fileDb.close();

    // "Restart": open a brand-new connection and app over the same file.
    fileDb = openDb(file);
    const restarted = createApp(fileDb);
    const order = await request(restarted).get(`/api/orders/${created.body.reference}`);
    const products = await request(restarted).get('/api/products');
    fileDb.close();
    fs.rmSync(dir, { recursive: true, force: true });

    expect(order.status).toBe(200);
    expect(order.body.items[0]).toMatchObject({ productId: A, quantity: 2 });
    expect(products.body.find((p) => p.id === A).stock).toBe(3);
  });
});
