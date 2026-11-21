const { openDb } = require('./db');
const { createApp } = require('./app');
const { seedIfEmpty, syncCatalogue } = require('./seed');

const PORT = Number(process.env.PORT) || 3001;
const db = openDb();
if (seedIfEmpty(db)) {
  console.log('Empty database detected – seeded catalogue.');
} else {
  const added = syncCatalogue(db);
  if (added) console.log(`Catalogue sync: added ${added} new product(s); existing stock and orders untouched.`);
}

const server = createApp(db).listen(PORT, () => {
  console.log(`Order console API on http://localhost:${PORT}  (db: ${db.name})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
