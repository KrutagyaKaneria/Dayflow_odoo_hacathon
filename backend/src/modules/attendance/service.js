const { prisma } = require('../../config/db');
const { AttendanceError } = require('./errors');
const { deriveAttendanceDate, computeHours, deriveStatus } = require('./attendancePolicy');
const { computePayableDaysForPeriod } = require('../integration/payableDays');

// Both check-in and check-out act only on the calling user's own profile (see routes.js) — the
// employee is never accepted from the request body/query. This removes impersonation as a
// concern by construction, so neither endpoint needs requireSelfOrRole.
async function getEmployeeProfileId(userId) {
  const profile = await prisma.employeeProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) {
    throw new AttendanceError(404, 'PROFILE_NOT_FOUND', 'No employee profile exists for this account.');
  }
  return profile.id;
}

function toDateOnly(dateString) {
  // attendance_date is a DATE column (no time-of-day); constructing from 'YYYY-MM-DD' gives a
  // UTC-midnight Date, which is how Prisma round-trips @db.Date values.
  return new Date(`${dateString}T00:00:00.000Z`);
}

async function checkIn(userId) {
  const employeeProfileId = await getEmployeeProfileId(userId);
  const now = new Date();
  const attendanceDate = deriveAttendanceDate(now);

  try {
    return await prisma.attendanceRecord.create({
      data: {
        employeeProfileId,
        attendanceDate: toDateOnly(attendanceDate),
        checkInAt: now,
        // Tentative — recomputed by deriveStatus() at checkout. See attendancePolicy.js (D-25).
        status: 'present',
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      // The unique constraint (employee_profile_id, attendance_date) is the real defense here,
      // not this catch — see the concurrency test in tests/integration.
      throw new AttendanceError(409, 'ALREADY_CHECKED_IN', 'Already checked in for today.');
    }
    throw err;
  }
}

async function checkOut(userId) {
  const employeeProfileId = await getEmployeeProfileId(userId);
  const now = new Date();
  const attendanceDate = deriveAttendanceDate(now);

  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      employeeProfileId_attendanceDate: { employeeProfileId, attendanceDate: toDateOnly(attendanceDate) },
    },
  });
  // Phase 09: check_in_at is nullable now (a LEAVE row synced from an approved leave has no
  // observed check-in — see modules/integration/syncLeaveApprovalToAttendance.js). A record
  // that exists but was never checked into is not an open session to close out, so it must be
  // treated the same as "no record at all" here — otherwise computeHours() below would be
  // called with a null checkInAt and produce garbage (NaN) work/extra hours.
  if (!existing || !existing.checkInAt || existing.checkOutAt) {
    throw new AttendanceError(409, 'NOT_CHECKED_IN', 'No open check-in for today.');
  }

  const { workHours, extraHours } = computeHours(existing.checkInAt, now);
  const status = deriveStatus(workHours);

  return prisma.attendanceRecord.update({
    where: { id: existing.id },
    data: { checkOutAt: now, workHours, extraHours, status },
  });
}

async function getToday(userId) {
  const employeeProfileId = await getEmployeeProfileId(userId);
  const attendanceDate = deriveAttendanceDate(new Date());

  const record = await prisma.attendanceRecord.findUnique({
    where: {
      employeeProfileId_attendanceDate: { employeeProfileId, attendanceDate: toDateOnly(attendanceDate) },
    },
  });

  // Phase 09: checkedIn must reflect an actual observed check-in, not merely "a row exists" —
  // a LEAVE row synced from approved leave (checkInAt null) is not a check-in, and must not
  // drive the nav status dot green or the widget into its "Since HH:MM" state.
  return {
    checkedIn: Boolean(record && record.checkInAt),
    checkInAt: record ? record.checkInAt : null,
    checkedOut: Boolean(record && record.checkOutAt),
  };
}

function resolveMonth(monthParam) {
  if (typeof monthParam === 'string' && /^\d{4}-\d{2}$/.test(monthParam)) {
    return monthParam;
  }
  return deriveAttendanceDate(new Date()).slice(0, 7);
}

function monthRange(month) {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(mon === 12 ? year + 1 : year, mon === 12 ? 0 : mon, 1));
  return { start, end };
}

async function getMyMonth(userId, monthParam) {
  const employeeProfileId = await getEmployeeProfileId(userId);
  const month = resolveMonth(monthParam);
  const { start, end } = monthRange(month);

  const records = await prisma.attendanceRecord.findMany({
    where: { employeeProfileId, attendanceDate: { gte: start, lt: end } },
    orderBy: { attendanceDate: 'asc' },
  });

  const daysPresent = records.filter((r) => r.status === 'present' || r.status === 'half_day').length;
  // Phase 09, Part B: leavesCount is now real — the count of LEAVE-status attendance records
  // this month, i.e. rows the approval sync wrote (modules/integration/
  // syncLeaveApprovalToAttendance.js). No separate leave-table query needed; `records` already
  // covers the month.
  const leavesCount = records.filter((r) => r.status === 'leave').length;

  // Phase 09, Part C: totalWorkingDays now uses the SAME shared helper as the payable-days
  // endpoint (modules/integration/payableDays.js) — one implementation, not two. Still honestly
  // null (not a guess) if the employee has no salary structure yet.
  const { totalWorkingDays } = await computePayableDaysForPeriod(employeeProfileId, month);

  return {
    month,
    records,
    summary: { daysPresent, leavesCount, totalWorkingDays },
  };
}

async function listForDate({ date, search }) {
  const attendanceDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : deriveAttendanceDate(new Date());

  const records = await prisma.attendanceRecord.findMany({
    where: {
      attendanceDate: toDateOnly(attendanceDate),
      ...(search ? { employeeProfile: { name: { contains: search, mode: 'insensitive' } } } : {}),
    },
    include: { employeeProfile: { select: { userId: true, name: true, avatarUrl: true } } },
    orderBy: { employeeProfile: { name: 'asc' } },
  });

  return { date: attendanceDate, records };
}

module.exports = { checkIn, checkOut, getToday, getMyMonth, listForDate };
