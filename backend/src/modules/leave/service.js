const { prisma } = require('../../config/db');
const { LeaveError } = require('./errors');
const { countDays, rangesOverlap, deriveBalance, resolveAllocatedDays, toDateOnlyString } = require('./leavePolicy');

const VALID_LEAVE_TYPES = ['paid_time_off', 'sick_leave', 'unpaid_leave'];
const ACTIVE_STATUSES = ['pending', 'approved'];

// Same pattern as attendance/service.js (Phase 06) — leave attaches to the employee profile,
// not the user, and both check-in-style endpoints resolve it from req.user.id only.
async function getEmployeeProfileId(userId) {
  const profile = await prisma.employeeProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) {
    throw new LeaveError(404, 'PROFILE_NOT_FOUND', 'No employee profile exists for this account.');
  }
  return profile.id;
}

function toDateOnly(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

// Postgres exclusion-constraint violations (code 23P01) are NOT one of Prisma's mapped
// "known request error" codes (unlike unique-constraint P2002) — they surface as a
// PrismaClientUnknownRequestError with no `.code` at all, only a message containing the raw
// Postgres error. Detecting it by message content is the only option Prisma leaves open here.
function isOverlapConstraintViolation(err) {
  return typeof err.message === 'string' && (err.message.includes('23P01') || err.message.includes('leave_requests_no_overlap'));
}

// GiST exclusion constraints (leave_requests_no_overlap) take index-page locks while checking
// for conflicts, and under true concurrent inserts Postgres can report a DEADLOCK (40P01)
// between two transactions rather than cleanly resolving to one exclusion-constraint violation
// — this is a documented GiST behavior, and it happens even between inserts whose ranges don't
// actually overlap (spurious lock contention, not a real conflict). A bounded retry is the
// correct response, not treating every deadlock as a real OVERLAPPING_LEAVE_REQUEST: on retry,
// a genuine conflict will cleanly resurface as 23P01 (isOverlapConstraintViolation, above) and
// a spurious one will simply succeed.
function isDeadlock(err) {
  return typeof err.message === 'string' && (err.message.includes('40P01') || err.message.includes('deadlock detected'));
}
const MAX_CREATE_ATTEMPTS = 3;

async function submitLeave(userId, { leaveType, startDate, endDate, remarks, attachmentUrl }) {
  if (!VALID_LEAVE_TYPES.includes(leaveType)) {
    throw new LeaveError(400, 'VALIDATION_ERROR', 'leaveType must be one of paid_time_off, sick_leave, unpaid_leave.');
  }
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    throw new LeaveError(400, 'VALIDATION_ERROR', 'startDate and endDate must be YYYY-MM-DD dates.');
  }
  if (endDate < startDate) {
    throw new LeaveError(400, 'VALIDATION_ERROR', 'endDate must be on or after startDate.');
  }

  const employeeProfileId = await getEmployeeProfileId(userId);

  // Overlap is checked against ALL leave types for this employee (an employee can't be on paid
  // time off and sick leave simultaneously), not just the same type as the new request.
  const existingActive = await prisma.leaveRequest.findMany({
    where: { employeeProfileId, status: { in: ACTIVE_STATUSES } },
    select: { startDate: true, endDate: true, leaveType: true, status: true, daysCount: true },
  });

  const overlapping = existingActive.some((r) =>
    rangesOverlap(startDate, endDate, r.startDate, r.endDate)
  );
  if (overlapping) {
    throw new LeaveError(
      409,
      'OVERLAPPING_LEAVE_REQUEST',
      'This date range overlaps an existing pending or approved leave request.'
    );
  }

  const daysCount = countDays(startDate, endDate);

  // Balance is advisory only (D-08, ENFORCE_BALANCE_HARD_LIMIT = false) — exceedsBalance is
  // computed and returned, but never blocks submission. unpaid_leave has no ceiling to exceed
  // (resolveAllocatedDays returns null for it), so the check is skipped only for that type.
  let exceedsBalance = false;
  const balanceRow = await prisma.leaveBalance.findUnique({
    where: { employeeProfileId_leaveType: { employeeProfileId, leaveType } },
  });
  const allocated = resolveAllocatedDays(leaveType, balanceRow);
  if (allocated != null) {
    const sameTypeExisting = existingActive.filter((r) => r.leaveType === leaveType);
    const balance = deriveBalance(allocated, sameTypeExisting);
    exceedsBalance = balance.available - daysCount < 0;
  }

  let lastErr;
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    try {
      const record = await prisma.leaveRequest.create({
        data: {
          employeeProfileId,
          leaveType,
          startDate: toDateOnly(startDate),
          endDate: toDateOnly(endDate),
          daysCount,
          remarks: remarks || null,
          attachmentUrl: attachmentUrl || null,
          status: 'pending',
        },
      });
      return { record, exceedsBalance };
    } catch (err) {
      if (isOverlapConstraintViolation(err)) {
        // The DB-level exclusion constraint (see the migration) is the real defense against a
        // concurrent overlapping insert slipping past the application-level check above.
        throw new LeaveError(
          409,
          'OVERLAPPING_LEAVE_REQUEST',
          'This date range overlaps an existing pending or approved leave request.'
        );
      }
      if (isDeadlock(err) && attempt < MAX_CREATE_ATTEMPTS - 1) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function listMine(userId, year) {
  const employeeProfileId = await getEmployeeProfileId(userId);
  const y = year && /^\d{4}$/.test(String(year)) ? Number(year) : new Date().getFullYear();
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const yearEnd = new Date(Date.UTC(y + 1, 0, 1));

  // Scoped by start_date within the year — a request spanning a year boundary shows under its
  // start year. A reasonable simplification for a calendar view, not a stated requirement gap.
  const records = await prisma.leaveRequest.findMany({
    where: { employeeProfileId, startDate: { gte: yearStart, lt: yearEnd } },
    orderBy: { startDate: 'asc' },
  });
  return { year: y, records };
}

async function getBalance(userId) {
  const employeeProfileId = await getEmployeeProfileId(userId);
  const [balanceRows, requests] = await Promise.all([
    prisma.leaveBalance.findMany({ where: { employeeProfileId } }),
    prisma.leaveRequest.findMany({
      where: { employeeProfileId, status: { in: ACTIVE_STATUSES } },
      select: { leaveType: true, status: true, daysCount: true },
    }),
  ]);

  const result = {};
  for (const type of VALID_LEAVE_TYPES) {
    const row = balanceRows.find((b) => b.leaveType === type);
    const requestsForType = requests.filter((r) => r.leaveType === type);
    result[type] = deriveBalance(resolveAllocatedDays(type, row), requestsForType);
  }
  return result;
}

async function listAll({ status, search }) {
  const where = {};
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    where.status = status;
  }
  if (search) {
    where.employeeProfile = { name: { contains: search, mode: 'insensitive' } };
  }
  return prisma.leaveRequest.findMany({
    where,
    include: { employeeProfile: { select: { userId: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

// Conditional update (WHERE status = 'pending'), not read-then-write — the affected-row count is
// the concurrency guarantee: two simultaneous decisions on the same request produce exactly one
// transition, since only one UPDATE can match the WHERE clause before the row's status changes.
async function decide(adminUserId, leaveId, action, adminComment) {
  const status = action === 'approve' ? 'approved' : 'rejected';
  const result = await prisma.leaveRequest.updateMany({
    where: { id: leaveId, status: 'pending' },
    data: { status, adminComment: adminComment || null, decidedByUserId: adminUserId, decidedAt: new Date() },
  });

  if (result.count === 0) {
    const existing = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!existing) {
      throw new LeaveError(404, 'NOT_FOUND', 'Leave request not found.');
    }
    throw new LeaveError(409, 'LEAVE_ALREADY_DECIDED', 'This leave request has already been decided.');
  }

  return prisma.leaveRequest.findUnique({ where: { id: leaveId } });
}

// D-09: read-only, every employee's per-type figures. No edit affordance, no adjustment endpoint.
async function listAllocations() {
  const [profiles, balances, requests] = await Promise.all([
    prisma.employeeProfile.findMany({ select: { id: true, userId: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.leaveBalance.findMany(),
    prisma.leaveRequest.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { employeeProfileId: true, leaveType: true, status: true, daysCount: true },
    }),
  ]);

  return profiles.map((profile) => {
    const balancesByType = {};
    for (const type of VALID_LEAVE_TYPES) {
      const row = balances.find((b) => b.employeeProfileId === profile.id && b.leaveType === type);
      const requestsForEmployee = requests.filter((r) => r.employeeProfileId === profile.id && r.leaveType === type);
      balancesByType[type] = deriveBalance(resolveAllocatedDays(type, row), requestsForEmployee);
    }
    return { employeeId: profile.userId, name: profile.name, balances: balancesByType };
  });
}

async function getHolidays(userId, year) {
  const y = year && /^\d{4}$/.test(String(year)) ? Number(year) : new Date().getFullYear();
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const yearEnd = new Date(Date.UTC(y + 1, 0, 1));

  // GET /holidays works even without an employee_profile (e.g. a Path B account) — holidays are
  // org-wide informational data, not gated on profile existence the way /leaves/me is.
  const profile = await prisma.employeeProfile.findUnique({ where: { userId }, select: { organizationId: true } });
  const orgId = profile ? profile.organizationId : null;

  const holidays = await prisma.publicHoliday.findMany({
    where: {
      holidayDate: { gte: yearStart, lt: yearEnd },
      OR: orgId ? [{ organizationId: null }, { organizationId: orgId }] : [{ organizationId: null }],
    },
    orderBy: { holidayDate: 'asc' },
  });
  return { year: y, holidays };
}

module.exports = {
  submitLeave,
  listMine,
  getBalance,
  listAll,
  decide,
  listAllocations,
  getHolidays,
  toDateOnlyString,
};
