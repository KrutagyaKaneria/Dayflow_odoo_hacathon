/**
 * Attendance endpoints — Phase 06. Check-in/check-out, own month history, Admin day-scoped
 * listing, cross-employee isolation, and the concurrency guarantee on double check-in.
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

describe('POST /attendance/check-in', () => {
  test('creates today\'s record for the caller\'s own profile', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.record.checkOutAt).toBeNull();
    expect(res.body.record.status).toBe('present');
    expect(res.body.record.attendanceDate.slice(0, 10)).toBe(deriveAttendanceDate(new Date()));
  });

  test('a second check-in the same day -> 409 ALREADY_CHECKED_IN', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);
    const second = await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_CHECKED_IN');
  });

  test('no token -> 401', async () => {
    const res = await request(app).post('/attendance/check-in');
    expect(res.status).toBe(401);
  });

  // The unique DB constraint (employee_profile_id, attendance_date) is the real defense — not
  // an application-level pre-check — so two truly concurrent check-ins must still produce
  // exactly one record.
  test('concurrency: two simultaneous check-ins for the same employee produce exactly one record', async () => {
    const { user, profile, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const [first, second] = await Promise.all([
      request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`),
      request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const rows = await prisma.attendanceRecord.findMany({ where: { employeeProfileId: profile.id } });
    expect(rows).toHaveLength(1);
  });
});

describe('POST /attendance/check-out', () => {
  test('without a prior check-in -> 409 NOT_CHECKED_IN', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app).post('/attendance/check-out').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_CHECKED_IN');
  });

  test('no token -> 401', async () => {
    const res = await request(app).post('/attendance/check-out');
    expect(res.status).toBe(401);
  });

  test('computes and persists work hours, extra hours, and status correctly; a second check-out -> 409', async () => {
    const { user, profile, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const checkInRes = await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);
    // Back-date the check-in by exactly 9h so check-out reproduces the design's worked example
    // (10:00 -> 19:00) without needing an admin-correction endpoint this phase deliberately
    // doesn't build (D-07) — direct DB manipulation is test setup, not a code path under test.
    const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000);
    await prisma.attendanceRecord.update({
      where: { id: checkInRes.body.record.id },
      data: { checkInAt: nineHoursAgo },
    });

    const checkOutRes = await request(app).post('/attendance/check-out').set('Authorization', `Bearer ${accessToken}`);
    expect(checkOutRes.status).toBe(200);
    expect(checkOutRes.body.record.workHours).toBe(9);
    expect(checkOutRes.body.record.extraHours).toBe(1);
    expect(checkOutRes.body.record.status).toBe('present');

    const stored = await prisma.attendanceRecord.findUnique({ where: { id: checkInRes.body.record.id } });
    expect(Number(stored.workHours)).toBe(9);
    expect(Number(stored.extraHours)).toBe(1);
    expect(stored.employeeProfileId).toBe(profile.id);

    const secondCheckOut = await request(app).post('/attendance/check-out').set('Authorization', `Bearer ${accessToken}`);
    expect(secondCheckOut.status).toBe(409);
    expect(secondCheckOut.body.error.code).toBe('NOT_CHECKED_IN');
  });

  test('a short session below the half-day threshold is marked half_day', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const checkInRes = await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.attendanceRecord.update({
      where: { id: checkInRes.body.record.id },
      data: { checkInAt: twoHoursAgo },
    });

    const checkOutRes = await request(app).post('/attendance/check-out').set('Authorization', `Bearer ${accessToken}`);
    expect(checkOutRes.status).toBe(200);
    expect(checkOutRes.body.record.status).toBe('half_day');
  });

  test('a record left open (no check-out) stays check_out_at NULL — no background job mutates it', async () => {
    const { user, profile, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);

    const stored = await prisma.attendanceRecord.findFirst({ where: { employeeProfileId: profile.id } });
    expect(stored.checkOutAt).toBeNull();
    expect(stored.workHours).toBeNull();
    expect(stored.status).toBe('present');
  });
});

describe('GET /attendance/today', () => {
  test('reflects not-checked-in, checked-in, and checked-out states', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const before = await request(app).get('/attendance/today').set('Authorization', `Bearer ${accessToken}`);
    expect(before.body).toEqual({ checkedIn: false, checkInAt: null, checkedOut: false });

    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${accessToken}`);
    const during = await request(app).get('/attendance/today').set('Authorization', `Bearer ${accessToken}`);
    expect(during.body.checkedIn).toBe(true);
    expect(during.body.checkedOut).toBe(false);
    expect(during.body.checkInAt).not.toBeNull();

    await request(app).post('/attendance/check-out').set('Authorization', `Bearer ${accessToken}`);
    const after = await request(app).get('/attendance/today').set('Authorization', `Bearer ${accessToken}`);
    expect(after.body.checkedIn).toBe(true);
    expect(after.body.checkedOut).toBe(true);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/attendance/today');
    expect(res.status).toBe(401);
  });
});

describe('GET /attendance/me — cross-employee isolation', () => {
  test('returns only the caller\'s own records, never another employee\'s', async () => {
    const { user: userA, password: passwordA } = await createEmployeeWithProfile();
    const { user: userB, password: passwordB } = await createEmployeeWithProfile();
    const tokenA = await signIn(userA.email, passwordA);
    const tokenB = await signIn(userB.email, passwordB);

    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${tokenA}`);

    const resB = await request(app).get('/attendance/me').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);
    expect(resB.body.records).toEqual([]);
    expect(resB.body.summary).toEqual({ daysPresent: 0, leavesCount: 0, totalWorkingDays: null });

    const resA = await request(app).get('/attendance/me').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.records).toHaveLength(1);
  });

  // An employee id passed via body or query must be ignored outright, not honored — check-in/
  // check-out/today/me all resolve the target solely from req.user.id (the access token).
  test('an employeeId supplied in the query string is ignored — the caller always sees only their own data', async () => {
    const { user: userA, profile: profileA, password: passwordA } = await createEmployeeWithProfile();
    const { user: userB, password: passwordB } = await createEmployeeWithProfile();
    const tokenB = await signIn(userB.email, passwordB);
    await signIn(userA.email, passwordA);

    await prisma.attendanceRecord.create({
      data: {
        employeeProfileId: profileA.id,
        attendanceDate: new Date(`${deriveAttendanceDate(new Date())}T00:00:00.000Z`),
        checkInAt: new Date(),
        status: 'present',
      },
    });

    const res = await request(app)
      .get(`/attendance/me?employeeId=${userA.id}&userId=${userA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/attendance/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /attendance — Admin day-scoped listing', () => {
  test('Admin sees all employees for the given date', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: empA, password: passwordA } = await createEmployeeWithProfile({ profileOverrides: { name: 'Alice' } });
    const { user: empB, password: passwordB } = await createEmployeeWithProfile({ profileOverrides: { name: 'Bob' } });
    const tokenA = await signIn(empA.email, passwordA);
    const tokenB = await signIn(empB.email, passwordB);
    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${tokenA}`);
    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${tokenB}`);

    const adminToken = await signIn(admin.email, adminPassword);
    const res = await request(app).get('/attendance').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.date).toBe(deriveAttendanceDate(new Date()));
    const names = res.body.records.map((r) => r.employee.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });

  test('returns an empty array for a date with no records', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const adminToken = await signIn(admin.email, adminPassword);

    const res = await request(app).get('/attendance?date=2000-01-01').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
  });

  test('supports ?search= on employee name, case-insensitive', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: empA, password: passwordA } = await createEmployeeWithProfile({ profileOverrides: { name: 'Alice Wonderland' } });
    const { user: empB, password: passwordB } = await createEmployeeWithProfile({ profileOverrides: { name: 'Bob Marley' } });
    const tokenA = await signIn(empA.email, passwordA);
    const tokenB = await signIn(empB.email, passwordB);
    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${tokenA}`);
    await request(app).post('/attendance/check-in').set('Authorization', `Bearer ${tokenB}`);

    const adminToken = await signIn(admin.email, adminPassword);
    const res = await request(app).get('/attendance?search=ali').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.records.map((r) => r.employee.name);
    expect(names).toEqual(['Alice Wonderland']);
  });

  test('an Employee caller -> 403', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app).get('/attendance').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/attendance');
    expect(res.status).toBe(401);
  });
});
