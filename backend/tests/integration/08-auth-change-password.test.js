/**
 * POST /auth/change-password. Phase 03 RBAC matrix: requireAuth only, no role restriction —
 * any authenticated user changes their own password.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { createSignedInUser, truncateAuthTables, DEFAULT_PASSWORD } = require('./support/authTestHelpers');

const app = createApp();

beforeEach(async () => {
  await truncateAuthTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /auth/change-password', () => {
  test('a valid token changes the caller\'s own password and clears must_change_password', async () => {
    const { user, password } = await createSignedInUser({ mustChangePassword: true });
    const signIn = await request(app).post('/auth/signin').send({ identifier: user.email, password });

    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${signIn.body.accessToken}`)
      .send({ currentPassword: password, newPassword: 'NewPassw0rd!' });

    expect(res.status).toBe(200);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored.mustChangePassword).toBe(false);

    // Old password no longer works; new one does.
    const oldSignIn = await request(app).post('/auth/signin').send({ identifier: user.email, password });
    expect(oldSignIn.status).toBe(401);
    const newSignIn = await request(app)
      .post('/auth/signin')
      .send({ identifier: user.email, password: 'NewPassw0rd!' });
    expect(newSignIn.status).toBe(200);
  });

  test('no token -> 401', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'NewPassw0rd!' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('malformed token -> 401', async () => {
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'NewPassw0rd!' });
    expect(res.status).toBe(401);
  });

  test('wrong current password -> 401, informative but does not change the stored hash', async () => {
    const { user, password } = await createSignedInUser();
    const signIn = await request(app).post('/auth/signin').send({ identifier: user.email, password });

    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${signIn.body.accessToken}`)
      .send({ currentPassword: 'WrongPassw0rd!', newPassword: 'NewPassw0rd!' });

    expect(res.status).toBe(401);
    const stillWorks = await request(app).post('/auth/signin').send({ identifier: user.email, password });
    expect(stillWorks.status).toBe(200);
  });
});
