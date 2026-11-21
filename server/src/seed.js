const { openDb } = require('./db');

// Synthetic catalogue: prices in paise (₹1 = 100 paise) to avoid floating-point money.
// Includes in-stock, low-stock (1-5 units) and out-of-stock items.
const PRODUCTS = [
  { sku: 'TEE-BLK-M', name: 'Classic Cotton Tee – Black', category: 'Apparel', price_paise: 59900, stock: 25 },
  { sku: 'JNS-IND-32', name: 'Slim Fit Jeans – Indigo', category: 'Apparel', price_paise: 189900, stock: 12 },
  { sku: 'SHT-WHT-M', name: 'Oxford Shirt – White', category: 'Apparel', price_paise: 149900, stock: 4 },
  { sku: 'SCK-3PK', name: 'Ankle Socks (3-pack)', category: 'Apparel', price_paise: 29900, stock: 3 },
  { sku: 'SNK-WHT-9', name: 'Everyday Sneakers – White', category: 'Footwear', price_paise: 249900, stock: 8 },
  { sku: 'RUN-GRY-10', name: 'Running Shoes – Grey', category: 'Footwear', price_paise: 299900, stock: 15 },
  { sku: 'LFR-TAN-9', name: 'Leather Loafers – Tan', category: 'Footwear', price_paise: 349900, stock: 6 },
  { sku: 'CAP-NVY', name: 'Baseball Cap – Navy', category: 'Accessories', price_paise: 44900, stock: 30 },
  { sku: 'TOT-NAT', name: 'Canvas Tote Bag – Natural', category: 'Accessories', price_paise: 69900, stock: 18 },
  { sku: 'BLT-BRN-34', name: 'Leather Belt – Brown', category: 'Accessories', price_paise: 89900, stock: 2 },
  { sku: 'JKT-OLV-L', name: 'Utility Jacket – Olive', category: 'Outerwear', price_paise: 329900, stock: 0 },
  { sku: 'BLZ-BLK-L', name: 'Tailored Blazer – Black', category: 'Outerwear', price_paise: 399900, stock: 7 },
];

// Products renamed between versions: old SKU -> new catalogue entry.
// Renaming in place keeps the product id, its stock and any order references.
const RENAMED = { 'VST-BLK-L': 'BLZ-BLK-L' };

const insertSql =
  'INSERT INTO products (sku, name, category, price_paise, stock) VALUES (@sku, @name, @category, @price_paise, @stock)';

/** Wipes all data and inserts the catalogue. */
function resetAndSeed(db, products = PRODUCTS) {
  db.transaction(() => {
    db.exec('DELETE FROM order_events; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products;');
    const insert = db.prepare(insertSql);
    for (const p of products) insert.run({ category: 'General', ...p });
  })();
}

/**
 * Non-destructive catalogue sync for existing databases: adds catalogue SKUs that
 * are missing and fills in categories for rows created before categories existed.
 * Never touches stock of existing products or any orders.
 */
function syncCatalogue(db, products = PRODUCTS) {
  let added = 0;
  db.transaction(() => {
    const rename = db.prepare('UPDATE products SET sku = ?, name = ?, category = ?, price_paise = ? WHERE sku = ?');
    for (const [oldSku, newSku] of Object.entries(RENAMED)) {
      const p = products.find((x) => x.sku === newSku);
      const exists = db.prepare('SELECT 1 FROM products WHERE sku = ?').get(newSku);
      if (p && !exists) rename.run(p.sku, p.name, p.category, p.price_paise, oldSku);
    }
    const insert = db.prepare(insertSql.replace('INSERT', 'INSERT OR IGNORE'));
    const setCategory = db.prepare("UPDATE products SET category = ? WHERE sku = ? AND category = 'General'");
    for (const p of products) {
      added += insert.run(p).changes;
      setCategory.run(p.category, p.sku);
    }
  })();
  return added;
}

/** Seeds only when the catalogue is empty (first boot). */
function seedIfEmpty(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  if (n === 0) resetAndSeed(db);
  return n === 0;
}

module.exports = { PRODUCTS, resetAndSeed, seedIfEmpty, syncCatalogue };

if (require.main === module) {
  const db = openDb();
  resetAndSeed(db);
  console.log(`Seeded ${PRODUCTS.length} products into ${db.name} (all orders cleared).`);
  db.close();
}
