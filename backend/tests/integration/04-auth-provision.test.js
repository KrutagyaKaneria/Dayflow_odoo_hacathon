/**
 * Path A — admin-provisioned account creation (POST /employees/provision). Phase 02, with
 * Phase 03's requireAuth/requireRole('admin_hr') RBAC matrix applied here.
 *
 * Always available regardless of ENABLE_SELF_SERVICE_SIGNUP — see the Dual-Path Signup
 * Handling note in modules/auth/service.js.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { prisma, config } = require('../../src/config/db');
const { createOrganization, createSignedInUser, truncateAuthTables } = require('./support/authTestHelpers');

const app = createApp();

beforeEach(async () => {
  await truncateAuthTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signInAndGetAccessToken(email, password) {
  const res = await request(app).post('/auth/signin').send({ identifier: email, password });
  return res.body.accessToken;
}

describe('POST /employees/provision', () => {
  test('an authenticated admin_hr user can provision a new employee account with a matching login id and one-time password', async () => {
    const org = await createOrganization({ name: 'Odoo India' });
    const { user: admin, password } = await createSignedInUser({ role: 'admin_hr', organizationId: org.id });
    const accessToken = await signInAndGetAccessToken(admin.email, password);

    const res = await request(app)
      .post('/employees/provision')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', dateOfJoining: '2022-06-15' });

    expect(res.status).toBe(201);
    expect(res.body.user.loginId).toBe('OIJODO20220001');
    expect(typeof res.body.initialPassword).toBe('string');
    expect(res.body.initialPassword.length).toBeGreaterThanOrEqual(20);
    expect(res.body.profile.name).toBe('John Doe');

    const stored = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    expect(stored.mustChangePassword).toBe(true);
    expect(stored.emailVerifiedAt).not.toBeNull();
    expect(stored.passwordHash).not.toBe(res.body.initialPassword); // never stored in plaintext
  });

  test('a second provisioning request for the same initials/year produces a distinct, non-colliding login id', async () => {
    const org = await createOrganization({ name: 'Odoo India' });
    const { user: admin, password } = await createSignedInUser({ role: 'admin_hr', organizationId: org.id });
    const accessToken = await signInAndGetAccessToken(admin.email, password);

    const first = await request(app)
      .post('/employees/provision')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'john.doe.1@example.com', dateOfJoining: '2022-06-15' });
    const second = await request(app)
      .post('/employees/provision')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'john.doe.2@example.com', dateOfJoining: '2022-09-01' });

    expect(first.body.user.loginId).toBe('OIJODO20220001');
    expect(second.body.user.loginId).toBe('OIJODO20220002');
    expect(second.body.user.loginId).not.toBe(first.body.user.loginId);
  });

  test('a non-admin caller is rejected with 403 (shared requireRole primitive)', async () => {
    const org = await createOrganization();
    const { user, password } = await createSignedInUser({ role: 'employee', organizationId: org.id });
    const accessToken = await signInAndGetAccessToken(user.email, password);

    const res = await request(app)
      .post('/employees/provision')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Jane', lastName: 'Roe', email: 'jane.roe@example.com', dateOfJoining: '2023-01-01' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('an unauthenticated caller (no token) is rejected with 401', async () => {
    const res = await request(app)
      .post('/employees/provision')
      .send({ firstName: 'Jane', lastName: 'Roe', email: 'jane.roe@example.com', dateOfJoining: '2023-01-01' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('a malformed token is rejected with 401', async () => {
    const res = await request(app)
      .post('/employees/provision')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ firstName: 'Jane', lastName: 'Roe', email: 'jane.roe@example.com', dateOfJoining: '2023-01-01' });

    expect(res.status).toBe(401);
  });

  test('an expired token is rejected with 401', async () => {
    const org = await createOrganization();
    const { user } = await createSignedInUser({ role: 'admin_hr', organizationId: org.id });
    const expiredToken = jwt.sign(
      { sub: user.id, role: user.role, organizationId: org.id },
      config.jwtAccessSecret,
      { expiresIn: -10 }
    );

    const res = await request(app)
      .post('/employees/provision')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ firstName: 'Jane', lastName: 'Roe', email: 'jane.roe@example.com', dateOfJoining: '2023-01-01' });

    expect(res.status).toBe(401);
  });

  // Cross-org isolation check (D-01 still open, organization_id still nullable per Phase 01):
  // the endpoint never reads an org id from the request body — it always derives the target
  // organization from the calling admin's own token claim, so a client-supplied organizationId
  // cannot be used to provision into an org the caller doesn't belong to.
  test('a client-supplied organizationId in the body is ignored; provisioning always targets the caller\'s own org', async () => {
    const callerOrg = await createOrganization({ name: 'Odoo India' });
    const otherOrg = await createOrganization({ name: 'Zeta Corp' });
    const { user: admin, password } = await createSignedInUser({ role: 'admin_hr', organizationId: callerOrg.id });
    const accessToken = await signInAndGetAccessToken(admin.email, password);

    const res = await request(app)
      .post('/employees/provision')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Jane',
        lastName: 'Roe',
        email: 'jane.roe@example.com',
        dateOfJoining: '2023-01-01',
        organizationId: otherOrg.id, // attempted injection — must be ignored
      });

    expect(res.status).toBe(201);
    const stored = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    expect(stored.organizationId).toBe(callerOrg.id);
    expect(stored.organizationId).not.toBe(otherOrg.id);
  });
});
