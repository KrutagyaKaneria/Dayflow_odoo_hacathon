/**
 * Payroll / Salary endpoints — Phase 08. Upsert transactionality, validation-before-persist,
 * the calculation engine end-to-end, D-03's view/edit boundary, cross-employee isolation, and
 * confirmation that this module never touches attendance_records or leave_requests.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { truncateAuthTables } = require('./support/authTestHelpers');
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

function designPayload(overrides = {}) {
  return {
    monthlyWage: 50000,
    yearlyWage: 600000,
    workingDaysPerWeek: 5,
    breakTimeHours: 1,
    components: [
      { name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 50, description: '50% of Wage', displayOrder: 1 },
      { name: 'House Rent Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, description: '50% of Basic', displayOrder: 2 },
      { name: 'Standard Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 16.67, description: '16.67% of Basic', displayOrder: 3 },
      { name: 'Performance Bonus', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 8.33, description: '8.33% of Basic', displayOrder: 4 },
      { name: 'Leave Travel Allowance', componentKind: 'earning', computationType: 'fixed_amount', isBasic: false, value: 1250, description: 'Fixed', displayOrder: 5 },
      { name: 'PF (Employee)', componentKind: 'deduction_employee', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: '12% of Basic', displayOrder: 6 },
      { name: 'PF (Employer)', componentKind: 'contribution_employer', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: 'Employer cost', displayOrder: 7 },
      { name: 'Professional Tax', componentKind: 'deduction_employee', computationType: 'fixed_amount', isBasic: false, value: 200, description: 'From Gross', displayOrder: 8 },
    ],
    ...overrides,
  };
}

describe('PATCH /payroll/:employeeId', () => {
  test('creates a structure where none existed, reproducing the design\'s figures', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);

    const res = await request(app)
      .patch(`/payroll/${emp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(designPayload());

    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.structure.components.map((c) => [c.name, c.amount]));
    expect(byName['Basic Salary']).toBe(25000);
    expect(byName['House Rent Allowance']).toBe(12500);
    expect(byName['Standard Allowance']).toBe(4167.5);
    expect(byName['Performance Bonus']).toBe(2082.5);
    expect(byName['PF (Employee)']).toBe(3000);
    expect(byName['PF (Employer)']).toBe(3000);
    expect(byName['Professional Tax']).toBe(200);
    expect(res.body.structure.grossSalary).toBe(45000);
    expect(res.body.structure.netSalary).toBe(41800);
  });

  test('a second PATCH overwrites cleanly with no orphaned component rows', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);

    await request(app).patch(`/payroll/${emp.id}`).set('Authorization', `Bearer ${adminToken}`).send(designPayload());
    const second = await request(app)
      .patch(`/payroll/${emp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        designPayload({
          monthlyWage: 60000,
          yearlyWage: 720000,
          components: [{ name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 100, displayOrder: 1 }],
        })
      );

    expect(second.status).toBe(200);
    const structure = await prisma.salaryStructure.findUnique({ where: { employeeProfileId: profile.id }, include: { components: true } });
    expect(structure.components).toHaveLength(1);
    expect(Number(structure.monthlyWage)).toBe(60000);
  });

  test('a validation failure (wage constraint) leaves the prior structure byte-for-byte unchanged', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);

    await request(app).patch(`/payroll/${emp.id}`).set('Authorization', `Bearer ${adminToken}`).send(designPayload());
    const before = await prisma.salaryStructure.findUnique({ where: { employeeProfileId: profile.id }, include: { components: true } });

    const invalid = await request(app)
      .patch(`/payroll/${emp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        designPayload({
          monthlyWage: 100,
          yearlyWage: 1200,
          components: [{ name: 'Basic Salary', componentKind: 'earning', computationType: 'fixed_amount', isBasic: true, value: 999999, displayOrder: 1 }],
        })
      );

    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('WAGE_CONSTRAINT_EXCEEDED');

    const after = await prisma.salaryStructure.findUnique({ where: { employeeProfileId: profile.id }, include: { components: true } });
    expect(after).toEqual(before);
  });

  test('yearly wage not equal to monthly × 12 -> 422 YEARLY_WAGE_MISMATCH', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);

    const res = await request(app)
      .patch(`/payroll/${emp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(designPayload({ yearlyWage: 500000 }));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('YEARLY_WAGE_MISMATCH');
  });

  test('a self-referential Basic component -> 422 SELF_REFERENTIAL_PERCENTAGE_BASE', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);

    const res = await request(app)
      .patch(`/payroll/${emp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        designPayload({
          components: [{ name: 'Basic', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: true, value: 50, displayOrder: 1 }],
        })
      );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SELF_REFERENTIAL_PERCENTAGE_BASE');
  });
});

describe('POST /payroll/:employeeId/preview', () => {
  test('returns figures and persists nothing', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);

    const res = await request(app)
      .post(`/payroll/${emp.id}/preview`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(designPayload());

    expect(res.status).toBe(200);
    expect(res.body.structure.grossSalary).toBe(45000);

    const stored = await prisma.salaryStructure.findUnique({ where: { employeeProfileId: profile.id } });
    expect(stored).toBeNull();
  });
});

describe('GET /payroll/me', () => {
  test('404s NO_SALARY_STRUCTURE for an employee with none configured', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app).get('/payroll/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_SALARY_STRUCTURE');
  });

  test('returns the caller\'s own computed structure once configured (D-03: employees CAN view their own)', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    await request(app).patch(`/payroll/${emp.id}`).set('Authorization', `Bearer ${adminToken}`).send(designPayload());

    const res = await request(app).get('/payroll/me').set('Authorization', `Bearer ${empToken}`);
    expect(res.status).toBe(200);
    expect(res.body.structure.grossSalary).toBe(45000);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/payroll/me');
    expect(res.status).toBe(401);
  });

  test('cross-employee isolation: an employeeId in the query is ignored — the caller always sees only their own data', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: userA } = await createEmployeeWithProfile();
    const { user: userB, password: passwordB } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const tokenB = await signIn(userB.email, passwordB);

    await request(app).patch(`/payroll/${userA.id}`).set('Authorization', `Bearer ${adminToken}`).send(designPayload());

    const res = await request(app).get(`/payroll/me?employeeId=${userA.id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404); // B has no structure of their own
  });
});

describe('D-03 boundary and RBAC matrix', () => {
  test('an Employee calling GET /payroll/:employeeId with THEIR OWN id still gets 403 — must use /me', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app).get(`/payroll/${user.id}`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('write-attempt isolation: an Employee attempting PATCH on their own structure gets 403 and nothing changes', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user, password, profile } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const accessToken = await signIn(user.email, password);

    await request(app).patch(`/payroll/${user.id}`).set('Authorization', `Bearer ${adminToken}`).send(designPayload());
    const before = await prisma.salaryStructure.findUnique({ where: { employeeProfileId: profile.id } });

    const res = await request(app)
      .patch(`/payroll/${user.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(designPayload({ monthlyWage: 999999, yearlyWage: 999999 * 12 }));

    expect(res.status).toBe(403);
    const after = await prisma.salaryStructure.findUnique({ where: { employeeProfileId: profile.id } });
    expect(after).toEqual(before);
  });

  test('GET /payroll — Admin 200, Employee 403, no token 401', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    expect((await request(app).get('/payroll').set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
    expect((await request(app).get('/payroll').set('Authorization', `Bearer ${empToken}`)).status).toBe(403);
    expect((await request(app).get('/payroll')).status).toBe(401);
  });

  test('POST /payroll/:employeeId/preview — Admin 200, Employee 403, no token 401', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    expect(
      (await request(app).post(`/payroll/${emp.id}/preview`).set('Authorization', `Bearer ${adminToken}`).send(designPayload())).status
    ).toBe(200);
    expect(
      (await request(app).post(`/payroll/${emp.id}/preview`).set('Authorization', `Bearer ${empToken}`).send(designPayload())).status
    ).toBe(403);
    expect((await request(app).post(`/payroll/${emp.id}/preview`).send(designPayload())).status).toBe(401);
  });
});

describe('Regression: no cross-module reads/writes, Phase 05/06/07 stubs unchanged', () => {
  test('a full create/overwrite cycle touches only payroll tables', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);

    await request(app).patch(`/payroll/${emp.id}`).set('Authorization', `Bearer ${adminToken}`).send(designPayload());
    await request(app).patch(`/payroll/${emp.id}`).set('Authorization', `Bearer ${adminToken}`).send(designPayload({ monthlyWage: 55000, yearlyWage: 660000 }));

    const attendanceRows = await prisma.attendanceRecord.count();
    const leaveRows = await prisma.leaveRequest.count();
    expect(attendanceRows).toBe(0);
    expect(leaveRows).toBe(0);
  });
});
