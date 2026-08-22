/**
 * Phase 10 — Security Hardening, item 2. signInLimiter/refreshLimiter skip when config.isTest is
 * true (see rateLimiters.js's skipInTest — otherwise every integration test file sharing one IP
 * under --runInBand would trip the limiter). This test exercises the REAL limiter behavior by
 * temporarily flipping config.isTest off, mounted on a bare express app — not the real /auth
 * routes — so it doesn't consume the shared signin budget those other tests rely on staying open.
 */
const express = require('express');
const request = require('supertest');
const { config } = require('../../src/config/db');
const { signInLimiter, refreshLimiter } = require('../../src/shared/security/rateLimiters');

function appWith(limiter) {
  const app = express();
  app.use(express.json());
  app.post('/probe', limiter, (req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('rate limiters', () => {
  let originalIsTest;

  beforeEach(() => {
    originalIsTest = config.isTest;
    config.isTest = false; // force the real (non-skipped) limiter behavior for this test only
  });

  afterEach(() => {
    config.isTest = originalIsTest;
  });

  test('signInLimiter allows up to the configured max, then 429s with a time-boxed window (not permanent)', async () => {
    const app = appWith(signInLimiter);
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/probe').send({ identifier: 'same-caller@example.com' });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/probe').send({ identifier: 'same-caller@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    // Time-boxed, not permanent: the response advertises a retry window rather than a permanent block.
    expect(blocked.headers).toHaveProperty('ratelimit-limit');
  });

  test('signInLimiter throttles per (IP, identifier) — a different identifier from the same caller is unaffected', async () => {
    const app = appWith(signInLimiter);
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app).post('/probe').send({ identifier: 'target-a@example.com' });
    }
    const blockedA = await request(app).post('/probe').send({ identifier: 'target-a@example.com' });
    expect(blockedA.status).toBe(429);

    const stillAllowedB = await request(app).post('/probe').send({ identifier: 'target-b@example.com' });
    expect(stillAllowedB.status).toBe(200);
  });

  test('refreshLimiter allows up to its own configured max, then 429s', async () => {
    const app = appWith(refreshLimiter);
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/probe').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/probe').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
