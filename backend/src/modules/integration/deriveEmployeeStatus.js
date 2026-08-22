/**
 * Phase 09, Part A — directory status-icon derivation. Replaces Phase 05's hardcoded 'unknown'.
 * See integrationPolicy.js for the D-40 precedence rule this implements.
 */
const { prisma } = require('../../config/db');
const { deriveAttendanceDate } = require('../attendance/attendancePolicy');

// Pure. Exported separately from the batch query function so the precedence rule itself is
// directly unit-testable without a database.
function deriveStatusIcon({ hasCheckIn, hasApprovedLeave }) {
  if (hasCheckIn) return 'present';
  if (hasApprovedLeave) return 'on_leave';
  return 'absent';
}

// Batched: exactly two queries regardless of how many employees are being listed — a directory
// of 200 employees must not issue 400 queries. Returns a Map keyed by employeeProfileId.
async function batchDeriveStatusIcons(employeeProfileIds) {
  if (employeeProfileIds.length === 0) return new Map();

  const today = deriveAttendanceDate(new Date());
  const todayDate = new Date(`${today}T00:00:00.000Z`);

  const [attendanceRows, leaveRows] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeProfileId: { in: employeeProfileIds }, attendanceDate: todayDate, checkInAt: { not: null } },
      select: { employeeProfileId: true },
    }),
    // Only APPROVED leave counts (D-40) — a PENDING request must never produce the airplane icon.
    prisma.leaveRequest.findMany({
      where: {
        employeeProfileId: { in: employeeProfileIds },
        status: 'approved',
        startDate: { lte: todayDate },
        endDate: { gte: todayDate },
      },
      select: { employeeProfileId: true },
    }),
  ]);

  const checkedIn = new Set(attendanceRows.map((r) => r.employeeProfileId));
  const onLeave = new Set(leaveRows.map((r) => r.employeeProfileId));

  const result = new Map();
  for (const id of employeeProfileIds) {
    result.set(id, deriveStatusIcon({ hasCheckIn: checkedIn.has(id), hasApprovedLeave: onLeave.has(id) }));
  }
  return result;
}

module.exports = { deriveStatusIcon, batchDeriveStatusIcons };
