/**
 * POST /auth/signin. Phase 02.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { createSignedInUser, truncateAuthTables, uniqueSuffix } = require('./support/authTestHelpers');

const app = createApp();

beforeEach(async () => {
  await truncateAuthTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /auth/signin', () => {
  test('succeeds with email as the identifier', async () => {
    const { user, password } = await createSignedInUser();
    const res = await request(app).post('/auth/signin').send({ identifier: user.email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  test('succeeds with login_id as the identifier', async () => {
    const { user, password } = await createSignedInUser({ loginId: `EMP-${uniqueSuffix()}` });
    const res = await request(app).post('/auth/signin').send({ identifier: user.loginId, password });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  test('rejects an incorrect password with a generic error', async () => {
    const { user } = await createSignedInUser();
    const res = await request(app).post('/auth/signin').send({ identifier: user.email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('rejects an unknown identifier with the same generic error (does not reveal which field was wrong)', async () => {
    const res = await request(app)
      .post('/auth/signin')
      .send({ identifier: `nobody-${uniqueSuffix()}@example.com`, password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('rejects a missing identifier/password with 400', async () => {
    const res = await request(app).post('/auth/signin').send({ identifier: 'someone@example.com' });
    expect(res.status).toBe(400);
  });

  // must_change_password is informational for the frontend, not a sign-in blocker (see
  // service.js signIn). TODO: confirm this is the desired UX before Phase 04's profile/settings
  // screen builds the forced-change flow.
  test('a must_change_password account still signs in successfully', async () => {
    const { user, password } = await createSignedInUser({ mustChangePassword: true });
    const res = await request(app).post('/auth/signin').send({ identifier: user.email, password });
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });

  test('a Path B account with no email_verified_at is blocked (TODO(D-17): default, not assumed permanent)', async () => {
    const { user, password } = await createSignedInUser({ emailVerifiedAt: null });
    const res = await request(app).post('/auth/signin').send({ identifier: user.email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
