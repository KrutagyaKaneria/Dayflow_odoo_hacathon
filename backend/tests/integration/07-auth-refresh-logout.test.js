/**
 * POST /auth/refresh and POST /auth/logout. Phase 02.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { createSignedInUser, truncateAuthTables } = require('./support/authTestHelpers');

const app = createApp();

beforeEach(async () => {
  await truncateAuthTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signIn(user, password) {
  const res = await request(app).post('/auth/signin').send({ identifier: user.email, password });
  return res.body;
}

describe('POST /auth/refresh', () => {
  test('rotates the refresh token: issues a new one and invalidates the old one', async () => {
    const { user, password } = await createSignedInUser();
    const { refreshToken: oldRefreshToken } = await signIn(user, password);

    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken: oldRefreshToken });
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.accessToken).toBe('string');
    expect(refreshRes.body.refreshToken).not.toBe(oldRefreshToken);

    const reuseRes = await request(app).post('/auth/refresh').send({ refreshToken: oldRefreshToken });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('rejects a missing refresh token with 401', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(401);
  });

  test('rejects an unknown/garbage refresh token with 401', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  test('revokes the current refresh token so it cannot be used again', async () => {
    const { user, password } = await createSignedInUser();
    const { accessToken, refreshToken } = await signIn(user, password);

    const logoutRes = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const reuseRes = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('requires a valid access token', async () => {
    const res = await request(app).post('/auth/logout').send({ refreshToken: 'whatever' });
    expect(res.status).toBe(401);
  });
});
