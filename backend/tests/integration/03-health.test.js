/**
 * Health check tests — Phase 01.
 *
 * 1. GET /health returns 200 { status: "ok", db: "connected" } against a live DB.
 * 2. When the DB is unreachable, /health returns a non-200 error envelope
 *    (simulated by injecting a client whose query rejects).
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { checkDbConnection } = require('../../src/config/db');

describe('GET /health', () => {
  test('returns 200 with db connected when the database is reachable', async () => {
    const app = createApp(); // real DB connection

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  test('returns a 503 error envelope when the database is unreachable', async () => {
    const failingDb = {
      checkDbConnection: async () => {
        // Simulates pointing the app at an unreachable/bad connection string.
        throw new Error('ECONNREFUSED');
      },
    };
    const app = createApp({ db: failingDb });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { message: 'Database connection failed.', code: 'SERVICE_UNAVAILABLE' },
    });
  });
});
