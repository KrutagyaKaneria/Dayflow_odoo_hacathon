/**
 * Path B — self-service signup (POST /auth/signup), gated by ENABLE_SELF_SERVICE_SIGNUP. Phase 02.
 *
 * D-01 is still open; the flag defaults to false in .env.example. These tests flip
 * process.env.ENABLE_SELF_SERVICE_SIGNUP directly (service.js reads it live, not from cached
 * config, precisely so this is possible without reloading modules — see config/env.js).
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { truncateAuthTables, uniqueSuffix } = require('./support/authTestHelpers');

const app = createApp();
const ORIGINAL_FLAG = process.env.ENABLE_SELF_SERVICE_SIGNUP;

beforeEach(async () => {
  await truncateAuthTables();
});

afterEach(() => {
  process.env.ENABLE_SELF_SERVICE_SIGNUP = ORIGINAL_FLAG;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /auth/signup — flag off (the .env.example default)', () => {
  test('returns 503 SIGNUP_DISABLED, not 404 — the route exists but is deliberately off', async () => {
    process.env.ENABLE_SELF_SERVICE_SIGNUP = 'false';

    const res = await request(app).post('/auth/signup').send({
      employeeId: `EMP-${uniqueSuffix()}`,
      email: `signup-${uniqueSuffix()}@example.com`,
      password: 'Passw0rd!',
      role: 'employee',
    });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SIGNUP_DISABLED');
  });
});

describe('POST /auth/signup — flag on', () => {
  beforeEach(() => {
    process.env.ENABLE_SELF_SERVICE_SIGNUP = 'true';
  });

  test('creates an unverified account that cannot sign in until POST /auth/verify-email succeeds', async () => {
    const email = `signup-${uniqueSuffix()}@example.com`;
    const password = 'Passw0rd!';

    const signupRes = await request(app).post('/auth/signup').send({
      employeeId: `EMP-${uniqueSuffix()}`,
      email,
      password,
      role: 'employee',
    });
    expect(signupRes.status).toBe(201);
    expect(typeof signupRes.body.verificationToken).toBe('string');

    const stored = await prisma.user.findUnique({ where: { id: signupRes.body.user.id } });
    expect(stored.emailVerifiedAt).toBeNull();

    const blockedSignIn = await request(app).post('/auth/signin').send({ identifier: email, password });
    expect(blockedSignIn.status).toBe(403);
    expect(blockedSignIn.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const badTokenRes = await request(app).post('/auth/verify-email').send({ token: 'not-a-real-token' });
    expect(badTokenRes.status).toBe(400);

    const verifyRes = await request(app)
      .post('/auth/verify-email')
      .send({ token: signupRes.body.verificationToken });
    expect(verifyRes.status).toBe(200);

    const allowedSignIn = await request(app).post('/auth/signin').send({ identifier: email, password });
    expect(allowedSignIn.status).toBe(200);
    expect(typeof allowedSignIn.body.accessToken).toBe('string');

    // A used verification token cannot be replayed.
    const replayRes = await request(app)
      .post('/auth/verify-email')
      .send({ token: signupRes.body.verificationToken });
    expect(replayRes.status).toBe(400);
  });

  test('rejects a duplicate email with 409', async () => {
    const email = `dup-${uniqueSuffix()}@example.com`;
    const payload = { employeeId: `EMP-${uniqueSuffix()}`, email, password: 'Passw0rd!', role: 'employee' };

    await request(app).post('/auth/signup').send(payload);
    const second = await request(app)
      .post('/auth/signup')
      .send({ ...payload, employeeId: `EMP-${uniqueSuffix()}` });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_EXISTS');
  });
});
