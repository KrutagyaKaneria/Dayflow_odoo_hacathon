/**
 * audit_log — Phase 10 Security Hardening, item 3 (D-23). Confirms an entry is written for each
 * of the four action classes D-23 requires (salary change, admin profile edit, leave
 * approve/reject, provisioning), and that metadata never carries raw bank numbers, password
 * hashes, or the login-id-generating password itself.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { truncateAuthTables, createOrganization } = require('./support/authTestHelpers');
const { createEmployeeWithProfile } = require('./support/employeeTestHelpers');

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

function latestEntry(action) {
  return prisma.auditLog.findFirst({ where: { action }, orderBy: { createdAt: 'desc' } });
}

describe('audit_log', () => {
  test('salary.upsert is recorded with the acting admin as actor, no monetary figures in metadata', async () => {
    const { user: admin, password } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: target } = await createEmployeeWithProfile();
    const token = await signIn(admin.email, password);

    const res = await request(app)
      .patch(`/payroll/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        monthlyWage: 50000,
        yearlyWage: 600000,
        components: [
          { name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 100, description: null, displayOrder: 1 },
        ],
      });
    expect(res.status).toBe(200);

    const entry = await latestEntry('salary.upsert');
    expect(entry).not.toBeNull();
    expect(entry.actorUserId).toBe(admin.id);
    expect(entry.targetType).toBe('salary_structure');
    const serialized = JSON.stringify(entry.metadata);
    expect(serialized).not.toContain('50000');
    expect(serialized).not.toContain('600000');
  });

  test('employee_profile.admin_update records changed field NAMES only — bank values never appear in metadata', async () => {
    const { user: admin, password } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: target, profile } = await createEmployeeWithProfile();
    const token = await signIn(admin.email, password);

    const res = await request(app)
      .patch(`/employees/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nationality: 'Indian', bankDetails: { accountNumber: 'ULTRASECRET123', panNo: 'ULTRAPAN999' } });
    expect(res.status).toBe(200);

    const entry = await latestEntry('employee_profile.admin_update');
    expect(entry).not.toBeNull();
    expect(entry.actorUserId).toBe(admin.id);
    expect(entry.targetType).toBe('employee_profile');
    expect(entry.targetId).toBe(profile.id);
    expect(entry.metadata.profileFieldsChanged).toContain('nationality');
    expect(entry.metadata.bankFieldsChanged).toEqual(expect.arrayContaining(['accountNumber', 'panNo']));
    const serialized = JSON.stringify(entry.metadata);
    expect(serialized).not.toContain('ULTRASECRET123');
    expect(serialized).not.toContain('ULTRAPAN999');
  });

  test('leave.approve and leave.reject are both recorded', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: employee, password } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const employeeToken = await signIn(employee.email, password);

    const submitRes = await request(app)
      .post('/leaves')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ leaveType: 'unpaid_leave', startDate: '2027-01-04', endDate: '2027-01-04' });
    expect(submitRes.status).toBe(201);
    const leaveId = submitRes.body.record.id;

    const approveRes = await request(app)
      .patch(`/leaves/${leaveId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(approveRes.status).toBe(200);

    const approveEntry = await latestEntry('leave.approve');
    expect(approveEntry).not.toBeNull();
    expect(approveEntry.actorUserId).toBe(admin.id);
    expect(approveEntry.targetType).toBe('leave_request');
    expect(approveEntry.targetId).toBe(leaveId);

    const submitRes2 = await request(app)
      .post('/leaves')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ leaveType: 'unpaid_leave', startDate: '2027-01-05', endDate: '2027-01-05' });
    const leaveId2 = submitRes2.body.record.id;

    const rejectRes = await request(app)
      .patch(`/leaves/${leaveId2}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ adminComment: 'Not approved' });
    expect(rejectRes.status).toBe(200);

    const rejectEntry = await latestEntry('leave.reject');
    expect(rejectEntry).not.toBeNull();
    expect(rejectEntry.targetId).toBe(leaveId2);
  });

  test('employee.provision is recorded and metadata never contains the initial password', async () => {
    const organization = await createOrganization();
    const { user: admin, password } = await createEmployeeWithProfile({
      role: 'admin_hr',
      profileOverrides: { organizationId: organization.id },
    });
    await prisma.user.update({ where: { id: admin.id }, data: { organizationId: organization.id } });
    const token = await signIn(admin.email, password);

    const res = await request(app)
      .post('/employees/provision')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'New', lastName: 'Hire', email: `new-hire-${Date.now()}@example.com`, dateOfJoining: '2026-08-22' });
    expect(res.status).toBe(201);
    const initialPassword = res.body.initialPassword;
    expect(initialPassword).toBeTruthy();

    const entry = await latestEntry('employee.provision');
    expect(entry).not.toBeNull();
    expect(entry.actorUserId).toBe(admin.id);
    expect(entry.targetType).toBe('user');
    const serialized = JSON.stringify(entry.metadata);
    expect(serialized).not.toContain(initialPassword);
  });
});
