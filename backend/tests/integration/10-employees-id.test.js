/**
 * GET/PATCH /employees/:id. Phase 04 RBAC matrix (extends Phase 03's) — conservative D-14
 * default: only the profile owner or Admin/HR can reach this endpoint at all.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { truncateAuthTables } = require('./support/authTestHelpers');
const { createEmployeeWithProfile } = require('./support/employeeTestHelpers');
const { decryptField } = require('../../src/shared/security/fieldEncryption');

const app = createApp();

beforeEach(async () => {
  await truncateAuthTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signIn(email, password) {
  const res = await request(app).post('/auth/signin').send({ identifier: email, password });
  return res.body.accessToken;
}

describe('GET /employees/:id', () => {
  test('the owner can fetch their own profile by id', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app).get(`/employees/${user.id}`).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.userId).toBe(user.id);
  });

  test('an Admin can fetch any employee\'s profile by id', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: target } = await createEmployeeWithProfile({
      bankDetails: { accountNumber: '999888777' },
    });
    const accessToken = await signIn(admin.email, adminPassword);

    const res = await request(app).get(`/employees/${target.id}`).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.userId).toBe(target.id);
    expect(res.body.profile.bankDetails.accountNumber).toBe('999888777');
  });

  test('a different Employee is rejected with 403 — Bank Details never leak in the response', async () => {
    const { user: caller, password } = await createEmployeeWithProfile();
    const { user: target } = await createEmployeeWithProfile({
      bankDetails: { accountNumber: '111222333', panNo: 'SECRET1234' },
    });
    const accessToken = await signIn(caller.email, password);

    const res = await request(app).get(`/employees/${target.id}`).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('111222333');
    expect(serialized).not.toContain('SECRET1234');
    expect(serialized).not.toContain('bankDetails');
  });

  test('no token -> 401', async () => {
    const { user } = await createEmployeeWithProfile();
    const res = await request(app).get(`/employees/${user.id}`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /employees/:id', () => {
  test('Admin can change any profile field, including ones an Employee cannot touch on their own profile', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: target, profile: targetProfile } = await createEmployeeWithProfile();
    const accessToken = await signIn(admin.email, adminPassword);

    const res = await request(app)
      .patch(`/employees/${target.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nationality: 'Indian', // not employee-editable
        department: 'Engineering', // core identity field
        bankDetails: { accountNumber: '444555666', bankName: 'Union Bank' },
      });

    expect(res.status).toBe(200);
    expect(res.body.profile.nationality).toBe('Indian');
    expect(res.body.profile.department).toBe('Engineering');
    expect(res.body.profile.bankDetails.accountNumber).toBe('444555666');
    expect(res.body.profile.bankDetails.bankName).toBe('Union Bank');

    const storedBank = await prisma.employeeBankDetails.findUnique({
      where: { employeeProfileId: targetProfile.id },
    });
    // Phase 10: account_number is encrypted at rest — the raw column is ciphertext, and
    // decrypting it recovers exactly what the Admin wrote.
    expect(storedBank.accountNumber).not.toBe('444555666');
    expect(decryptField(storedBank.accountNumber)).toBe('444555666');
  });

  test('Admin cannot change system/immutable fields (dateOfJoining) via this endpoint', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: target, profile: targetProfile } = await createEmployeeWithProfile();
    const accessToken = await signIn(admin.email, adminPassword);
    const originalDateOfJoining = targetProfile.dateOfJoining.toISOString();

    const res = await request(app)
      .patch(`/employees/${target.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dateOfJoining: '2020-01-01' });

    expect(res.status).toBe(200);
    const stored = await prisma.employeeProfile.findUnique({ where: { id: targetProfile.id } });
    expect(stored.dateOfJoining.toISOString()).toBe(originalDateOfJoining);
  });

  test('an Employee is rejected with 403 even on their own id — /me must be used instead', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app)
      .patch(`/employees/${user.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+1-555-0199' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    const stored = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
    expect(stored.phone).toBeNull();
  });

  test('no token -> 401', async () => {
    const { user } = await createEmployeeWithProfile();
    const res = await request(app).patch(`/employees/${user.id}`).send({ phone: '123' });
    expect(res.status).toBe(401);
  });
});
