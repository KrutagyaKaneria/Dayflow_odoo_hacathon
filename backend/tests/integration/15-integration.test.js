/**
 * Cross-module integration — Phase 09. Directory status icons (Part A), Leave→Attendance sync
 * (Part B), payable days (Part C), and the regression checks the phase spec explicitly expects
 * to fail-and-be-updated (Phase 05's 'unknown' stub, Phase 06's leavesCount/totalWorkingDays
 * stubs) live in their own already-updated test files — this file covers the new behavior.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { truncateAuthTables } = require('./support/authTestHelpers');
const { createEmployeeWithProfile } = require('./support/employeeTestHelpers');
const { deriveAttendanceDate } = require('../../src/modules/attendance/attendancePolicy');

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

async function checkIn(accessToken) {
  return request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);
}

async function submitLeave(accessToken, overrides = {}) {
  return request(app)
    .post('/leaves')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ leaveType: 'paid_time_off', startDate: '2026-09-01', endDate: '2026-09-01', ...overrides });
}

describe('Part A — directory status icons (D-40)', () => {
  test('present: an employee with a check-in today shows "present", even with approved leave also covering today', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user, profile, password } = await createEmployeeWithProfile({ profileOverrides: { name: 'Present Employee' } });
    const adminToken = await signIn(admin.email, adminPassword);
    const accessToken = await signIn(user.email, password);

    await checkIn(accessToken);
    const today = deriveAttendanceDate(new Date());
    await prisma.leaveRequest.create({
      data: {
        employeeProfileId: profile.id,
        leaveType: 'paid_time_off',
        startDate: new Date(`${today}T00:00:00.000Z`),
        endDate: new Date(`${today}T00:00:00.000Z`),
        daysCount: 1,
        status: 'approved',
        decidedByUserId: admin.id,
        decidedAt: new Date(),
      },
    });

    const res = await request(app).get('/employees?search=Present Employee').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.employees[0].statusIcon).toBe('present');
  });

  test('on_leave: an employee with an approved leave for today and NO check-in shows "on_leave"', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user, profile } = await createEmployeeWithProfile({ profileOverrides: { name: 'On Leave Employee' } });
    const adminToken = await signIn(admin.email, adminPassword);

    const today = deriveAttendanceDate(new Date());
    await prisma.leaveRequest.create({
      data: {
        employeeProfileId: profile.id,
        leaveType: 'paid_time_off',
        startDate: new Date(`${today}T00:00:00.000Z`),
        endDate: new Date(`${today}T00:00:00.000Z`),
        daysCount: 1,
        status: 'approved',
        decidedByUserId: admin.id,
        decidedAt: new Date(),
      },
    });

    const res = await request(app).get('/employees?search=On Leave Employee').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.employees[0].statusIcon).toBe('on_leave');
  });

  test('absent: no check-in and no approved leave shows "absent"', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    await createEmployeeWithProfile({ profileOverrides: { name: 'Absent Employee' } });
    const adminToken = await signIn(admin.email, adminPassword);

    const res = await request(app).get('/employees?search=Absent Employee').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.employees[0].statusIcon).toBe('absent');
  });

  test('a PENDING (not approved) leave never produces "on_leave"', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { profile } = await createEmployeeWithProfile({ profileOverrides: { name: 'Pending Leave Employee' } });
    const adminToken = await signIn(admin.email, adminPassword);

    const today = deriveAttendanceDate(new Date());
    await prisma.leaveRequest.create({
      data: {
        employeeProfileId: profile.id,
        leaveType: 'paid_time_off',
        startDate: new Date(`${today}T00:00:00.000Z`),
        endDate: new Date(`${today}T00:00:00.000Z`),
        daysCount: 1,
        status: 'pending',
      },
    });

    const res = await request(app).get('/employees?search=Pending Leave Employee').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.employees[0].statusIcon).toBe('absent');
  });

  test('the minimal projection is unchanged — no Private Info, Bank Details, salary, or leave detail leaks in', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    await createEmployeeWithProfile({
      profileOverrides: { name: 'Projection Check', nationality: 'Testland' },
      bankDetails: { accountNumber: 'SECRET-ACCT' },
    });
    const adminToken = await signIn(admin.email, adminPassword);

    const res = await request(app).get('/employees?search=Projection Check').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const entry = res.body.employees[0];
    expect(Object.keys(entry).sort()).toEqual(['avatarUrl', 'id', 'name', 'statusIcon'].sort());
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('SECRET-ACCT');
    expect(serialized).not.toContain('Testland');
  });

  test('a directory of 50+ employees issues a bounded number of queries, not one per employee', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const adminToken = await signIn(admin.email, adminPassword);
    for (let i = 0; i < 55; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createEmployeeWithProfile({ profileOverrides: { name: `Bulk Employee ${String(i).padStart(3, '0')}` } });
    }

    // Monkey-patch the two specific batch-query methods batchDeriveStatusIcons calls — this
    // Prisma version has no $use/middleware API on an already-instantiated client, so counting
    // via a generic query-log hook isn't available; wrapping the exact two methods under test
    // is simpler and more targeted anyway (it proves THIS derivation is O(1), not just that
    // "some bounded number of queries" happened across the whole request).
    let attendanceFindManyCalls = 0;
    let leaveFindManyCalls = 0;
    const originalAttendanceFindMany = prisma.attendanceRecord.findMany.bind(prisma.attendanceRecord);
    const originalLeaveFindMany = prisma.leaveRequest.findMany.bind(prisma.leaveRequest);
    prisma.attendanceRecord.findMany = (...args) => {
      attendanceFindManyCalls += 1;
      return originalAttendanceFindMany(...args);
    };
    prisma.leaveRequest.findMany = (...args) => {
      leaveFindManyCalls += 1;
      return originalLeaveFindMany(...args);
    };

    let res;
    try {
      res = await request(app).get('/employees').set('Authorization', `Bearer ${adminToken}`);
    } finally {
      prisma.attendanceRecord.findMany = originalAttendanceFindMany;
      prisma.leaveRequest.findMany = originalLeaveFindMany;
    }

    expect(res.status).toBe(200);
    expect(res.body.employees.length).toBeGreaterThan(0);
    // Exactly one attendanceRecord.findMany and one leaveRequest.findMany for the whole page of
    // 55+ employees — not one per employee (which would be 55+ each).
    expect(attendanceFindManyCalls).toBe(1);
    expect(leaveFindManyCalls).toBe(1);
  }, 30000); // 55 sequential bcrypt-hashed fixture creations legitimately exceed Jest's 5s default.
});

describe('Part B — Leave→Attendance sync (D-39)', () => {
  test('approving leave on a date with no attendance record inserts a LEAVE row', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const submitRes = await submitLeave(empToken, { startDate: '2026-09-01', endDate: '2026-09-01' });
    const approveRes = await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.attendanceSyncSkippedDates).toEqual([]);

    const row = await prisma.attendanceRecord.findUnique({
      where: { employeeProfileId_attendanceDate: { employeeProfileId: profile.id, attendanceDate: new Date('2026-09-01T00:00:00.000Z') } },
    });
    expect(row).not.toBeNull();
    expect(row.status).toBe('leave');
    expect(row.checkInAt).toBeNull();
  });

  test('approving leave on a date with an existing check-in leaves the record unchanged and reports the skip', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const today = deriveAttendanceDate(new Date());
    const checkInRes = await checkIn(empToken);
    expect(checkInRes.status).toBe(201);

    const submitRes = await submitLeave(empToken, { startDate: today, endDate: today });
    const approveRes = await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.attendanceSyncSkippedDates).toEqual([today]);

    // Assert against the database, not just the response — the record must be byte-for-byte
    // the same PRESENT check-in row, not overwritten to LEAVE.
    const row = await prisma.attendanceRecord.findUnique({
      where: { employeeProfileId_attendanceDate: { employeeProfileId: profile.id, attendanceDate: new Date(`${today}T00:00:00.000Z`) } },
    });
    expect(row.status).toBe('present');
    expect(row.checkInAt).not.toBeNull();
  });

  test('approving a multi-day range writes one row per date, including weekends', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    // 2026-09-05 (Sat) through 2026-09-07 (Mon) — includes a weekend.
    const submitRes = await submitLeave(empToken, { startDate: '2026-09-05', endDate: '2026-09-07' });
    const approveRes = await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approveRes.status).toBe(200);

    const rows = await prisma.attendanceRecord.findMany({ where: { employeeProfileId: profile.id }, orderBy: { attendanceDate: 'asc' } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'leave')).toBe(true);
  });

  test('rejecting a leave request writes no attendance rows', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const submitRes = await submitLeave(empToken, { startDate: '2026-09-01', endDate: '2026-09-01' });
    await request(app).patch(`/leaves/${submitRes.body.record.id}/reject`).set('Authorization', `Bearer ${adminToken}`);

    const rows = await prisma.attendanceRecord.findMany({ where: { employeeProfileId: profile.id } });
    expect(rows).toHaveLength(0);
  });

  test('GET /attendance/me leavesCount reflects synced LEAVE-status rows', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const submitRes = await submitLeave(empToken, { startDate: '2026-09-01', endDate: '2026-09-02' });
    await request(app).patch(`/leaves/${submitRes.body.record.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app).get('/attendance/me?month=2026-09').set('Authorization', `Bearer ${empToken}`);
    expect(res.body.summary.leavesCount).toBe(2);
  });
});

describe('Part C — payable days (D-38)', () => {
  async function seedSalaryStructure(employeeProfileId, workingDaysPerWeek = 5) {
    await prisma.salaryStructure.create({
      data: {
        employeeProfileId,
        wageType: 'fixed',
        monthlyWage: 50000,
        yearlyWage: 600000,
        workingDaysPerWeek,
      },
    });
  }

  test('full breakdown for a constructed period', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);
    await seedSalaryStructure(profile.id, 5);

    // 2026-09: Sep 1 = Tue. Present on 1st, missing on 2nd, half-day on 3rd, unpaid leave 4th.
    await prisma.attendanceRecord.create({
      data: { employeeProfileId: profile.id, attendanceDate: new Date('2026-09-01T00:00:00.000Z'), checkInAt: new Date('2026-09-01T09:00:00Z'), status: 'present' },
    });
    await prisma.attendanceRecord.create({
      data: { employeeProfileId: profile.id, attendanceDate: new Date('2026-09-03T00:00:00.000Z'), checkInAt: new Date('2026-09-03T09:00:00Z'), checkOutAt: new Date('2026-09-03T11:00:00Z'), workHours: 2, extraHours: 0, status: 'half_day' },
    });
    const unpaidRes = await request(app)
      .post('/leaves')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ leaveType: 'unpaid_leave', startDate: '2026-09-04', endDate: '2026-09-04' });
    await request(app).patch(`/leaves/${unpaidRes.body.record.id}/approve`).set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app).get(`/payroll/${emp.id}/payable-days?period=2026-09`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.breakdown.unpaidLeaveDays).toBe(1);
    expect(res.body.breakdown.halfDays).toBe(1);
    expect(res.body.breakdown.missingAttendanceDays).toBeGreaterThanOrEqual(1); // 2nd, plus every other unaccounted working day
    expect(typeof res.body.totalWorkingDays).toBe('number');
    expect(typeof res.body.payableDays).toBe('number');
    // No monetary amount anywhere in the response.
    expect(JSON.stringify(res.body)).not.toMatch(/amount|salary|wage|gross|net/i);
  });

  test('totalWorkingDays matches between the payable-days endpoint and GET /attendance/me for the same employee/period', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);
    await seedSalaryStructure(profile.id, 5);

    const payableRes = await request(app).get(`/payroll/${emp.id}/payable-days?period=2026-09`).set('Authorization', `Bearer ${adminToken}`);
    const attendanceRes = await request(app).get('/attendance/me?month=2026-09').set('Authorization', `Bearer ${empToken}`);

    expect(attendanceRes.body.summary.totalWorkingDays).toBe(payableRes.body.totalWorkingDays);
  });

  test('an employee with no salary structure -> totalWorkingDays is null, not a guess, via both endpoints', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const payableRes = await request(app).get(`/payroll/${emp.id}/payable-days?period=2026-09`).set('Authorization', `Bearer ${adminToken}`);
    expect(payableRes.body.totalWorkingDays).toBeNull();
    expect(payableRes.body.payableDays).toBeNull();

    const attendanceRes = await request(app).get('/attendance/me?month=2026-09').set('Authorization', `Bearer ${empToken}`);
    expect(attendanceRes.body.summary.totalWorkingDays).toBeNull();
  });

  test('RBAC: Admin 200; Employee 403 including with their own id; no token 401', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);
    await seedSalaryStructure(profile.id, 5);

    expect((await request(app).get(`/payroll/${emp.id}/payable-days`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
    expect((await request(app).get(`/payroll/${emp.id}/payable-days`).set('Authorization', `Bearer ${empToken}`)).status).toBe(403);
    expect((await request(app).get(`/payroll/${emp.id}/payable-days`)).status).toBe(401);
  });
});
