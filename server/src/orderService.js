const { AppError } = require('./errors');

const STATUSES = ['PLACED', 'PACKED', 'SHIPPED', 'CANCELLED'];

// The single source of truth for the fulfilment state machine.
const TRANSITIONS = {
  PLACED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
};

const MAX_LINES = 50;
const MAX_QTY = 1000;

const now = () => new Date().toISOString();

// ---------- validation ----------

function validateOrderInput(body) {
  const errors = [];
  const input = body && typeof body === 'object' ? body : {};

  const customerName = typeof input.customerName === 'string' ? input.customerName.trim() : '';
  if (!customerName) errors.push({ field: 'customerName', message: 'Customer name is required' });
  else if (customerName.length > 100) errors.push({ field: 'customerName', message: 'Customer name is too long (max 100)' });

  let customerPhone = null;
  if (input.customerPhone !== undefined && input.customerPhone !== null && input.customerPhone !== '') {
    if (typeof input.customerPhone !== 'string' || !/^[0-9+\-\s()]{6,20}$/.test(input.customerPhone.trim())) {
      errors.push({ field: 'customerPhone', message: 'Phone must be 6-20 digits (+, -, spaces allowed)' });
    } else {
      customerPhone = input.customerPhone.trim();
    }
  }

  const merged = new Map(); // productId -> quantity (duplicate lines are combined)
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push({ field: 'items', message: 'Order must contain at least one item' });
  } else if (input.items.length > MAX_LINES) {
    errors.push({ field: 'items', message: `Order cannot have more than ${MAX_LINES} lines` });
  } else {
    input.items.forEach((item, i) => {
      const productId = item && item.productId;
      const quantity = item && item.quantity;
      if (!Number.isInteger(productId) || productId <= 0) {
        errors.push({ field: `items[${i}].productId`, message: 'productId must be a positive integer' });
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QTY) {
        errors.push({ field: `items[${i}].quantity`, message: `quantity must be an integer between 1 and ${MAX_QTY}` });
        return;
      }
      merged.set(productId, (merged.get(productId) || 0) + quantity);
    });
  }

  if (errors.length) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid order', errors);

  const items = [...merged].map(([productId, quantity]) => ({ productId, quantity }));
  return { customerName, customerPhone, items };
}

function validateIdempotencyKey(key) {
  if (key === undefined || key === null || key === '') return null;
  if (typeof key !== 'string' || key.length > 100) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Idempotency-Key must be a string of at most 100 characters');
  }
  return key;
}

// ---------- queries ----------

// A product is "low stock" when it has between 1 and this many units left.
const LOW_STOCK_THRESHOLD = 5;

const stockStatus = (stock) => (stock === 0 ? 'OUT_OF_STOCK' : stock <= LOW_STOCK_THRESHOLD ? 'LOW_STOCK' : 'IN_STOCK');

function listProducts(db) {
  return db
    .prepare('SELECT id, sku, name, category, price_paise AS pricePaise, stock FROM products ORDER BY category, name')
    .all()
    .map((p) => ({ ...p, stockStatus: stockStatus(p.stock) }));
}

/** Aggregates for the dashboard, computed from the database on every request. */
function getStats(db) {
  const ordersByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all()) {
    ordersByStatus[r.status] = r.n;
  }
  const totalOrders = Object.values(ordersByStatus).reduce((a, b) => a + b, 0);
  const { revenue } = db
    .prepare("SELECT COALESCE(SUM(total_paise), 0) AS revenue FROM orders WHERE status <> 'CANCELLED'")
    .get();

  const products = listProducts(db);
  const byCategory = db
    .prepare(
      `SELECT category, COUNT(*) AS skus, SUM(stock) AS units,
              SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS outOfStock
         FROM products GROUP BY category ORDER BY category`
    )
    .all();

  return {
    totalOrders,
    ordersByStatus,
    revenuePaise: revenue,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    lowStockCount: products.filter((p) => p.stockStatus === 'LOW_STOCK').length,
    outOfStockCount: products.filter((p) => p.stockStatus === 'OUT_OF_STOCK').length,
    inventory: {
      skuCount: products.length,
      totalUnits: products.reduce((s, p) => s + p.stock, 0),
      stockValuePaise: products.reduce((s, p) => s + p.stock * p.pricePaise, 0),
      byCategory,
    },
    stockAlerts: products.filter((p) => p.stockStatus !== 'IN_STOCK').sort((a, b) => a.stock - b.stock),
    recentOrders: listOrders(db, { limit: 6 }),
    ordersByDay: ordersByDay(db, 14),
  };
}

const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Orders and booked revenue (excl. cancelled) per local calendar day, oldest first, zero-filled. */
function ordersByDay(db, days, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  const buckets = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    buckets.set(localDay(d), { date: localDay(d), orders: 0, revenuePaise: 0 });
  }
  const rows = db.prepare('SELECT created_at, status, total_paise FROM orders WHERE created_at >= ?').all(start.toISOString());
  for (const r of rows) {
    const b = buckets.get(localDay(new Date(r.created_at)));
    if (!b) continue;
    b.orders += 1;
    if (r.status !== 'CANCELLED') b.revenuePaise += r.total_paise;
  }
  return [...buckets.values()];
}

function mapOrderRow(row) {
  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    status: row.status,
    totalPaise: row.total_paise,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getOrder(db, idOrRef) {
  const key = String(idOrRef);
  const row = /^\d+$/.test(key)
    ? db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(key))
    : db.prepare('SELECT * FROM orders WHERE reference = ? COLLATE NOCASE').get(key);
  if (!row) throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${key} not found`);

  const items = db
    .prepare(
      `SELECT oi.product_id AS productId, oi.product_name AS name, p.sku, p.category,
              oi.unit_price_paise AS unitPricePaise, oi.quantity,
              oi.unit_price_paise * oi.quantity AS lineTotalPaise
         FROM order_items oi JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ? ORDER BY oi.id`
    )
    .all(row.id);
  const history = db
    .prepare('SELECT from_status AS fromStatus, to_status AS toStatus, at FROM order_events WHERE order_id = ? ORDER BY id')
    .all(row.id);

  return { ...mapOrderRow(row), items, history, allowedTransitions: TRANSITIONS[row.status] };
}

function listOrders(db, { q, status, limit = 500 } = {}) {
  const where = [];
  const params = {};
  if (status !== undefined && status !== '' && status !== 'ALL') {
    if (!STATUSES.includes(status)) {
      throw new AppError(422, 'VALIDATION_ERROR', `status must be one of ${STATUSES.join(', ')}`);
    }
    where.push('o.status = @status');
    params.status = status;
  }
  if (typeof q === 'string' && q.trim()) {
    // Search by order reference (primary) or customer name (handy for phone staff).
    where.push("(o.reference LIKE @q ESCAPE '\\' OR o.customer_name LIKE @q ESCAPE '\\')");
    params.q = `%${q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  }
  const rows = db
    .prepare(
      `SELECT o.*, (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count
         FROM orders o
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY o.id DESC
        LIMIT @limit`
    )
    .all({ ...params, limit });
  return rows.map((r) => ({ ...mapOrderRow(r), itemCount: r.item_count }));
}

// ---------- commands ----------

/**
 * Places an order atomically. Either every line has enough stock and all stock is
 * deducted, or the whole order is rejected and no stock changes.
 * better-sqlite3 transactions are synchronous, so no other request can interleave
 * between the stock check and the deduction.
 */
function createOrder(db, body, idempotencyKey) {
  const key = validateIdempotencyKey(idempotencyKey);
  const { customerName, customerPhone, items } = validateOrderInput(body);

  const run = db.transaction(() => {
    if (key) {
      const existing = db.prepare('SELECT id FROM orders WHERE idempotency_key = ?').get(key);
      if (existing) return { order: getOrder(db, existing.id), replayed: true };
    }

    const getProduct = db.prepare('SELECT id, name, price_paise, stock FROM products WHERE id = ?');
    const unknown = [];
    const shortages = [];
    const lines = [];
    for (const { productId, quantity } of items) {
      const p = getProduct.get(productId);
      if (!p) {
        unknown.push(productId);
        continue;
      }
      if (p.stock < quantity) {
        shortages.push({ productId, name: p.name, requested: quantity, available: p.stock });
      }
      lines.push({ product: p, quantity });
    }
    if (unknown.length) {
      throw new AppError(422, 'UNKNOWN_PRODUCT', `Unknown product id(s): ${unknown.join(', ')}`, { productIds: unknown });
    }
    if (shortages.length) {
      const names = shortages.map((s) => `${s.name} (requested ${s.requested}, available ${s.available})`).join('; ');
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough stock: ${names}. No stock was changed.`, shortages);
    }

    const deduct = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const { product, quantity } of lines) {
      const res = deduct.run(quantity, product.id, quantity);
      if (res.changes !== 1) {
        // Unreachable inside a synchronous transaction; kept as defence in depth.
        throw new AppError(409, 'INSUFFICIENT_STOCK', `Stock changed for ${product.name}; please retry`);
      }
    }

    const total = lines.reduce((sum, l) => sum + l.product.price_paise * l.quantity, 0);
    const ts = now();
    const { lastInsertRowid: orderId } = db
      .prepare(
        `INSERT INTO orders (customer_name, customer_phone, status, total_paise, idempotency_key, created_at, updated_at)
         VALUES (?, ?, 'PLACED', ?, ?, ?, ?)`
      )
      .run(customerName, customerPhone, total, key, ts, ts);
    db.prepare('UPDATE orders SET reference = ? WHERE id = ?').run(`ORD-${String(orderId).padStart(5, '0')}`, orderId);

    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, product_name, unit_price_paise, quantity) VALUES (?, ?, ?, ?, ?)'
    );
    for (const { product, quantity } of lines) {
      insertItem.run(orderId, product.id, product.name, product.price_paise, quantity);
    }
    db.prepare('INSERT INTO order_events (order_id, from_status, to_status, at) VALUES (?, NULL, ?, ?)').run(orderId, 'PLACED', ts);

    return { order: getOrder(db, orderId), replayed: false };
  });

  return run();
}

/**
 * Moves an order to a new status. Invalid or skipped transitions are rejected here,
 * regardless of what the UI shows. Cancelling restores stock in the same transaction
 * as the status change, guarded by a compare-and-set on the current status, so stock
 * is restored exactly once even if the cancel request is repeated.
 */
function transitionOrder(db, idOrRef, to) {
  if (typeof to !== 'string' || !STATUSES.includes(to)) {
    throw new AppError(422, 'VALIDATION_ERROR', `status must be one of ${STATUSES.join(', ')}`);
  }

  const run = db.transaction(() => {
    const order = getOrder(db, idOrRef);
    const allowed = TRANSITIONS[order.status];
    if (!allowed.includes(to)) {
      const hint = allowed.length ? `Allowed next: ${allowed.join(', ')}` : `${order.status} is a final state`;
      throw new AppError(409, 'INVALID_TRANSITION', `Cannot move ${order.reference} from ${order.status} to ${to}. ${hint}.`, {
        from: order.status,
        to,
        allowed,
      });
    }

    const ts = now();
    const res = db
      .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
      .run(to, ts, order.id, order.status);
    if (res.changes !== 1) {
      throw new AppError(409, 'CONCURRENT_UPDATE', 'Order was updated by someone else; please refresh');
    }

    if (to === 'CANCELLED') {
      const restore = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const item of order.items) restore.run(item.quantity, item.productId);
    }

    db.prepare('INSERT INTO order_events (order_id, from_status, to_status, at) VALUES (?, ?, ?, ?)').run(
      order.id,
      order.status,
      to,
      ts
    );
    return getOrder(db, order.id);
  });

  return run();
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  LOW_STOCK_THRESHOLD,
  listProducts,
  listOrders,
  getOrder,
  getStats,
  createOrder,
  transitionOrder,
};
