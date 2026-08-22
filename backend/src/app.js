const express = require('express');
const { checkDbConnection } = require('./config/db');
const { sendError } = require('./shared/response');

function createApp({ db = { checkDbConnection } } = {}) {
  const app = express();

  app.use(express.json());

  // TEMP - revisit in Phase 10: bare-minimum CORS allow for local frontend dev only.
  // Full security middleware (CORS policy, rate limiting, etc.) begins in Phase 02/10.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // GET /health — the ONLY endpoint produced by Phase 01.
  app.get('/health', async (req, res) => {
    try {
      await db.checkDbConnection();
      res.status(200).json({ status: 'ok', db: 'connected' });
    } catch (err) {
      // Minimal application of the error envelope convention (see shared/README.md).
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Database connection failed.');
    }
  });

  return app;
}

module.exports = { createApp };
