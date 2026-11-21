const path = require('path');
const fs = require('fs');
const express = require('express');
const { AppError } = require('./errors');
const svc = require('./orderService');

function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/products', (req, res) => res.json(svc.listProducts(db)));

  api.get('/stats', (req, res) => res.json(svc.getStats(db)));

  api.get('/orders', (req, res) => {
    res.json(svc.listOrders(db, { q: req.query.q, status: req.query.status }));
  });

  api.get('/orders/:id', (req, res) => res.json(svc.getOrder(db, req.params.id)));

  api.post('/orders', (req, res) => {
    const { order, replayed } = svc.createOrder(db, req.body, req.get('Idempotency-Key'));
    res.status(replayed ? 200 : 201).set('Idempotent-Replayed', String(replayed)).json(order);
  });

  api.post('/orders/:id/status', (req, res) => {
    res.json(svc.transitionOrder(db, req.params.id, req.body && req.body.status));
  });

  api.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.originalUrl}` } });
  });

  app.use('/api', api);

  // Serve the built React app (after `npm run build`) so one process runs everything.
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });

  return app;
}

module.exports = { createApp };
