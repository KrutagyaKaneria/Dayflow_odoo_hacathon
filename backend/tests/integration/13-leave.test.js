/**
 * Leave / Time-Off endpoints — Phase 07. Application, balance derivation, overlap detection,
 * Admin approve/reject, cross-employee isolation (including attachments), and concurrency.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
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

async function submitLeave(accessToken, overrides = {}) {
  return request(app)
    .post('/leaves')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      leaveType: 'paid_time_off',
      startDate: '2025-06-02',
      endDate: '2025-06-03',
      ...overrides,
    });
}

describe('POST /leaves', () => {
  test('creates a PENDING request; balance pending rises and available falls', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const before = await request(app).get('/leaves/balance').set('Authorization', `Bearer ${accessToken}`);
    expect(before.body.balance.paid_time_off).toEqual({ allocated: 24, used: 0, pending: 0, available: 24 });

    const res = await submitLeave(accessToken);
    expect(res.status).toBe(201);
    expect(res.body.record.status).toBe('pending');
    expect(res.body.record.daysCount).toBe(2); // June 2 -> June 3 inclusive
    expect(res.body.exceedsBalance).toBe(false);

    const after = await request(app).get('/leaves/balance').set('Authorization', `Bearer ${accessToken}`);
    expect(after.body.balance.paid_time_off).toEqual({ allocated: 24, used: 0, pending: 2, available: 22 });
  });

  test('no token -> 401', async () => {
    const res = await request(app).post('/leaves').send({ leaveType: 'paid_time_off', startDate: '2025-06-02', endDate: '2025-06-03' });
    expect(res.status).toBe(401);
  });

  test('overlapping submission -> 409 OVERLAPPING_LEAVE_REQUEST', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    await submitLeave(accessToken, { startDate: '2025-06-02', endDate: '2025-06-10' });
    const overlapping = await submitLeave(accessToken, { startDate: '2025-06-08', endDate: '2025-06-12' });

    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error.code).toBe('OVERLAPPING_LEAVE_REQUEST');
  });

  test('a request adjacent to (not overlapping) an existing one succeeds', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    await submitLeave(accessToken, { startDate: '2025-06-02', endDate: '2025-06-05' });
    const adjacent = await submitLeave(accessToken, { startDate: '2025-06-06', endDate: '2025-06-08' });

    expect(adjacent.status).toBe(201);
  });

  test('overlap does not consider a REJECTED request', async () => {
    const { user, password } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(user.email, password);
    const empToken = await signIn(emp.email, empPassword);

    const first = await submitLeave(empToken, { startDate: '2025-06-02', endDate: '2025-06-05' });
    await request(app)
      .patch(`/leaves/${first.body.record.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);

    const second = await submitLeave(empToken, { startDate: '2025-06-02', endDate: '2025-06-05' });
    expect(second.status).toBe(201);
  });

  test('a request exceeding balance succeeds (201) with exceedsBalance: true — advisory, not blocked (D-08)', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await submitLeave(accessToken, { startDate: '2025-01-01', endDate: '2025-01-30' }); // 30 days > 24 allocated
    expect(res.status).toBe(201);
    expect(res.body.exceedsBalance).toBe(true);
  });

  test('unpaid_leave with no balance row succeeds with no balance error, exceedsBalance always false', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await submitLeave(accessToken, { leaveType: 'unpaid_leave', startDate: '2025-01-01', endDate: '2025-12-31' });
    expect(res.status).toBe(201);
    expect(res.body.exceedsBalance).toBe(false);

    const balance = await request(app).get('/leaves/balance').set('Authorization', `Bearer ${accessToken}`);
    expect(balance.body.balance.unpaid_leave).toEqual({ allocated: null, used: 0, pending: 365, available: null });
  });

  test('remarks are optional and persisted when provided (D-04)', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await submitLeave(accessToken, { remarks: 'Family event' });
    expect(res.body.record.remarks).toBe('Family event');
  });

  // Concurrency (§4.3): two simultaneous submissions with overlapping ranges -> at most one
  // succeeds. Defended by the DB exclusion constraint, not just the application-level check.
  test('concurrency: two simultaneous overlapping submissions -> at most one succeeds', async () => {
    const { user, profile, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const [first, second] = await Promise.all([
      submitLeave(accessToken, { startDate: '2025-07-01', endDate: '2025-07-05' }),
      submitLeave(accessToken, { startDate: '2025-07-03', endDate: '2025-07-08' }),
    ]);

    const statuses = [first.status, second.status].sort();
    // The losing request must come back as a clean 409, not a raw 500 — the overlap-constraint
    // violation has to be recognized and translated, not just "not count as a success".
    expect(statuses).toEqual([201, 409]);
    const losing = first.status === 201 ? second : first;
    expect(losing.body.error.code).toBe('OVERLAPPING_LEAVE_REQUEST');

    const rows = await prisma.leaveRequest.findMany({ where: { employeeProfileId: profile.id } });
    expect(rows).toHaveLength(1);
  });
});

describe('Approve / Reject', () => {
  test('approve: used rises, pending falls, available unchanged from post-submission figure', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const submitRes = await submitLeave(empToken);
    const postSubmission = await request(app).get('/leaves/balance').set('Authorization', `Bearer ${empToken}`);
    const availableAfterSubmit = postSubmission.body.balance.paid_time_off.available;

    const approveRes = await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ adminComment: 'Approved, enjoy!' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.record.status).toBe('approved');
    expect(approveRes.body.record.adminComment).toBe('Approved, enjoy!');

    const postApproval = await request(app).get('/leaves/balance').set('Authorization', `Bearer ${empToken}`);
    expect(postApproval.body.balance.paid_time_off.used).toBe(2);
    expect(postApproval.body.balance.paid_time_off.pending).toBe(0);
    expect(postApproval.body.balance.paid_time_off.available).toBe(availableAfterSubmit);
  });

  test('reject: pending falls, available returns to its pre-submission value', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const before = await request(app).get('/leaves/balance').set('Authorization', `Bearer ${empToken}`);
    const submitRes = await submitLeave(empToken);

    await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);

    const after = await request(app).get('/leaves/balance').set('Authorization', `Bearer ${empToken}`);
    expect(after.body.balance.paid_time_off).toEqual(before.body.balance.paid_time_off);
  });

  test('approving an already-decided request -> 409 LEAVE_ALREADY_DECIDED', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const submitRes = await submitLeave(empToken);
    await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    const second = await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('LEAVE_ALREADY_DECIDED');

    const rejectAfterApprove = await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(rejectAfterApprove.status).toBe(409);
  });

  // Concurrency: two simultaneous approvals of the same request -> exactly one transition, one
  // decided_by_user_id, via the conditional update (WHERE status = 'pending'), not read-then-write.
  test('concurrency: two simultaneous approvals -> exactly one transition', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const submitRes = await submitLeave(empToken);

    const [first, second] = await Promise.all([
      request(app).patch(`/leaves/${submitRes.body.record.id}/approve`).set('Authorization', `Bearer ${adminToken}`),
      request(app).patch(`/leaves/${submitRes.body.record.id}/approve`).set('Authorization', `Bearer ${adminToken}`),
    ]);

    const successCount = [first.status, second.status].filter((s) => s === 200).length;
    expect(successCount).toBe(1);

    const stored = await prisma.leaveRequest.findUnique({ where: { id: submitRes.body.record.id } });
    expect(stored.status).toBe('approved');
    expect(stored.decidedByUserId).not.toBeNull();
  });

  test('RBAC: Employee cannot approve/reject -> 403; no token -> 401', async () => {
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const empToken = await signIn(emp.email, empPassword);
    const submitRes = await submitLeave(empToken);

    const forbidden = await request(app)
      .patch(`/leaves/${submitRes.body.record.id}/approve`)
      .set('Authorization', `Bearer ${empToken}`);
    expect(forbidden.status).toBe(403);

    const unauth = await request(app).patch(`/leaves/${submitRes.body.record.id}/approve`);
    expect(unauth.status).toBe(401);
  });
});

describe('GET /leaves — Admin', () => {
  test('Admin sees all employees\' requests; Employee -> 403; no token -> 401', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile({ profileOverrides: { name: 'Alice' } });
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);
    await submitLeave(empToken);

    const adminRes = await request(app).get('/leaves').set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.records).toHaveLength(1);
    expect(adminRes.body.records[0].employee.name).toBe('Alice');

    const employeeRes = await request(app).get('/leaves').set('Authorization', `Bearer ${empToken}`);
    expect(employeeRes.status).toBe(403);

    const noToken = await request(app).get('/leaves');
    expect(noToken.status).toBe(401);
  });
});

describe('GET /leaves/allocations — Admin, D-09', () => {
  test('Admin sees every employee\'s figures; Employee -> 403', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile({ profileOverrides: { name: 'Bob' } });
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const res = await request(app).get('/leaves/allocations').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const bob = res.body.allocations.find((a) => a.name === 'Bob');
    expect(bob.balances.paid_time_off.allocated).toBe(24);

    const forbidden = await request(app).get('/leaves/allocations').set('Authorization', `Bearer ${empToken}`);
    expect(forbidden.status).toBe(403);
  });
});

describe('Cross-employee isolation', () => {
  test('GET /leaves/me never returns another employee\'s requests, even with an employeeId in the query', async () => {
    const { user: userA, password: passwordA } = await createEmployeeWithProfile();
    const { user: userB, password: passwordB } = await createEmployeeWithProfile();
    const tokenA = await signIn(userA.email, passwordA);
    const tokenB = await signIn(userB.email, passwordB);

    await submitLeave(tokenA);

    const resB = await request(app)
      .get(`/leaves/me?employeeId=${userA.id}&userId=${userA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);
    expect(resB.body.records).toEqual([]);
  });

  test('GET /leaves/balance never reflects another employee\'s usage, even with an employeeId in the body', async () => {
    const { user: userA, password: passwordA } = await createEmployeeWithProfile();
    const { user: userB, password: passwordB } = await createEmployeeWithProfile();
    const tokenA = await signIn(userA.email, passwordA);
    const tokenB = await signIn(userB.email, passwordB);

    await submitLeave(tokenA);

    const resB = await request(app)
      .get('/leaves/balance')
      .send({ employeeId: userA.id })
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.balance.paid_time_off).toEqual({ allocated: 24, used: 0, pending: 0, available: 24 });
  });

  test('attachment isolation: Employee B cannot fetch Employee A\'s attachment content', async () => {
    const { user: userA, password: passwordA } = await createEmployeeWithProfile();
    const { user: userB, password: passwordB } = await createEmployeeWithProfile();
    const tokenA = await signIn(userA.email, passwordA);
    const tokenB = await signIn(userB.email, passwordB);

    const filePath = path.join(os.tmpdir(), `dayflow-leave-${Date.now()}.png`);
    fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])); // full PNG signature
    const uploadRes = await request(app)
      .post('/leaves/attachment')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('attachment', filePath);
    fs.unlinkSync(filePath);

    expect(uploadRes.status).toBe(201);
    const { attachmentUrl } = uploadRes.body;

    const ownerFetch = await request(app).get(attachmentUrl).set('Authorization', `Bearer ${tokenA}`);
    expect(ownerFetch.status).toBe(200);

    const otherEmployeeFetch = await request(app).get(attachmentUrl).set('Authorization', `Bearer ${tokenB}`);
    expect(otherEmployeeFetch.status).toBe(403);

    const noTokenFetch = await request(app).get(attachmentUrl);
    expect(noTokenFetch.status).toBe(401);
  });

  test('an Admin CAN fetch any employee\'s attachment', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const filePath = path.join(os.tmpdir(), `dayflow-leave-${Date.now()}.png`);
    fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])); // full PNG signature
    const uploadRes = await request(app)
      .post('/leaves/attachment')
      .set('Authorization', `Bearer ${empToken}`)
      .attach('attachment', filePath);
    fs.unlinkSync(filePath);

    const adminFetch = await request(app).get(uploadRes.body.attachmentUrl).set('Authorization', `Bearer ${adminToken}`);
    expect(adminFetch.status).toBe(200);
  });
});

describe('POST /leaves/attachment — validation', () => {
  function tmpFile(name, buffer) {
    const filePath = path.join(os.tmpdir(), `dayflow-leave-${Date.now()}-${name}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  test('a valid PDF is accepted', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);
    const filePath = tmpFile('cert.pdf', Buffer.from('%PDF-1.4'));

    const res = await request(app)
      .post('/leaves/attachment')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('attachment', filePath);

    expect(res.status).toBe(201);
    expect(res.body.attachmentUrl).toMatch(/^\/leaves\/attachments\//);
    fs.unlinkSync(filePath);
  });

  test('an unsupported file type -> 4xx, not a crash', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);
    const filePath = tmpFile('notes.txt', Buffer.from('just text'));

    const res = await request(app)
      .post('/leaves/attachment')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('attachment', filePath);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    fs.unlinkSync(filePath);
  });

  test('an oversized file -> 4xx, not a crash', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);
    const filePath = tmpFile('big.png', Buffer.alloc(6 * 1024 * 1024, 1)); // > 5MB limit

    const res = await request(app)
      .post('/leaves/attachment')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('attachment', filePath);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    fs.unlinkSync(filePath);
  });

  test('no token -> 401', async () => {
    const res = await request(app).post('/leaves/attachment');
    expect(res.status).toBe(401);
  });
});

describe('GET /holidays', () => {
  test('returns the nine seeded 2026 dates', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const names = [
      'Kite Festival',
      'Republic Day',
      'Dhuleti',
      'Independence Day',
      'Rakhi',
      'Gandhi Jayanti',
      'Diwali',
      'New Year',
      'Bhai Duj',
    ];
    await Promise.all(
      names.map((name, i) =>
        prisma.publicHoliday.create({
          data: { organizationId: null, holidayDate: new Date(`2026-${String((i % 12) + 1).padStart(2, '0')}-10T00:00:00.000Z`), name },
        })
      )
    );

    const res = await request(app).get('/holidays?year=2026').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.holidays).toHaveLength(9);
    expect(res.body.holidays.map((h) => h.name).sort()).toEqual(names.sort());
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/holidays?year=2026');
    expect(res.status).toBe(401);
  });
});

// Superseded by Phase 09, Part B: [PDF §3.5.2] requires approval to "reflect immediately in
// employee records", and Phase 09 implements exactly that (see modules/integration/
// syncLeaveApprovalToAttendance.js and 15-integration.test.js for the full sync coverage). This
// test's ORIGINAL claim — that nothing in the leave module writes to attendance_records — was
// true and correct for Phase 07 in isolation, and is intentionally no longer true now that
// Phase 09 wires the two modules together. Kept here, updated, as a regression guard on the
// asymmetry Phase 09 introduced: approval syncs, rejection never does.
describe('Phase 09: only approval writes to attendance_records — rejection never does', () => {
  test('a full submit/approve/reject cycle writes attendance rows only for the approved request', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({ role: 'admin_hr' });
    const { user: emp, profile, password: empPassword } = await createEmployeeWithProfile();
    const adminToken = await signIn(admin.email, adminPassword);
    const empToken = await signIn(emp.email, empPassword);

    const req1 = await submitLeave(empToken, { startDate: '2025-08-01', endDate: '2025-08-02' });
    await request(app).patch(`/leaves/${req1.body.record.id}/approve`).set('Authorization', `Bearer ${adminToken}`);
    const req2 = await submitLeave(empToken, { startDate: '2025-09-01', endDate: '2025-09-02' });
    await request(app).patch(`/leaves/${req2.body.record.id}/reject`).set('Authorization', `Bearer ${adminToken}`);

    const attendanceRows = await prisma.attendanceRecord.findMany({ where: { employeeProfileId: profile.id } });
    // Exactly 2 rows — one per day of the APPROVED (Aug) request. The REJECTED (Sep) request
    // contributed zero, since rejection never syncs (a PENDING request never wrote rows to
    // reverse in the first place).
    expect(attendanceRows).toHaveLength(2);
    expect(attendanceRows.every((r) => r.status === 'leave')).toBe(true);
    expect(attendanceRows.every((r) => r.attendanceDate.toISOString().slice(0, 7) === '2025-08')).toBe(true);
  });
});
