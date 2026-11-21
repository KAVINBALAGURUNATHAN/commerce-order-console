const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'orders.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  sku         TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  -- DB-level safety net: stock can never go negative even if app logic had a bug.
  stock       INTEGER NOT NULL CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY,
  reference       TEXT    UNIQUE,
  customer_name   TEXT    NOT NULL,
  customer_phone  TEXT,
  status          TEXT    NOT NULL CHECK (status IN ('PLACED','PACKED','SHIPPED','CANCELLED')),
  total_paise     INTEGER NOT NULL CHECK (total_paise >= 0),
  idempotency_key TEXT    UNIQUE,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

-- Name and price are snapshotted so past orders don't change if the catalogue does.
CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id),
  product_id       INTEGER NOT NULL REFERENCES products(id),
  product_name     TEXT    NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS order_events (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  from_status TEXT,
  to_status   TEXT    NOT NULL,
  at          TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
`;

// Additive, idempotent migrations for databases created by earlier versions.
// They never drop data, so existing orders and stock are preserved.
function migrate(db) {
  const productCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!productCols.includes('category')) {
    db.exec("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'General'");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
}

function openDb(file = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

module.exports = { openDb, DEFAULT_DB_PATH, SCHEMA };
