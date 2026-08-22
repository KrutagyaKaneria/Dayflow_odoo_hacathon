/**
 * Phase 09, Part B — Leave→Attendance sync. [PDF §3.5.2]: approval must "reflect immediately in
 * employee records." Writes attendance_records.status = 'leave', a value Phase 06 defined and
 * deliberately never wrote. See integrationPolicy.js for the D-39 collision rule and the
 * D-30/D-33 notes this implements.
 *
 * MUST be called with the same Prisma transaction client (`tx`) the leave approval itself runs
 * in — this is not a standalone sync that can be invoked independently of an approval (a sync
 * with no approval attached would be a different, unaudited write path).
 */
const { OVERWRITE_ATTENDANCE_ON_LEAVE_APPROVAL } = require('./integrationPolicy');
const { toDateOnlyString } = require('../leave/leavePolicy');

function toDateOnly(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

// Pure. Every calendar date in [startDate, endDate], inclusive — weekends and holidays included,
// matching Phase 07's EXCLUDE_WEEKENDS_FROM_DAY_COUNT = false (TODO(D-30): these two defaults
// must move together).
function enumerateDates(startDate, endDate) {
  const start = new Date(`${toDateOnlyString(startDate)}T00:00:00.000Z`);
  const end = new Date(`${toDateOnlyString(endDate)}T00:00:00.000Z`);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Runs inside the caller's transaction. Returns { skippedDates }.
async function syncApprovedLeaveToAttendance(tx, leaveRequest) {
  const dates = enumerateDates(leaveRequest.startDate, leaveRequest.endDate);
  const skippedDates = [];

  for (const dateStr of dates) {
    const attendanceDate = toDateOnly(dateStr);
    const existing = await tx.attendanceRecord.findUnique({
      where: {
        employeeProfileId_attendanceDate: {
          employeeProfileId: leaveRequest.employeeProfileId,
          attendanceDate,
        },
      },
    });

    if (existing && existing.checkInAt) {
      // D-39: an observed check-in outranks a derived leave status. Do not overwrite; report
      // the conflict instead of silently dropping it.
      if (!OVERWRITE_ATTENDANCE_ON_LEAVE_APPROVAL) {
        skippedDates.push(dateStr);
        continue;
      }
    }

    try {
      if (existing) {
        // A row exists but has no check-in (e.g. a LEAVE placeholder from a prior overlapping
        // sync, which D-25's overlap rejection in leave/service.js should already prevent in
        // practice — handled defensively regardless).
        await tx.attendanceRecord.update({ where: { id: existing.id }, data: { status: 'leave' } });
      } else {
        await tx.attendanceRecord.create({
          data: {
            employeeProfileId: leaveRequest.employeeProfileId,
            attendanceDate,
            checkInAt: null,
            checkOutAt: null,
            workHours: null,
            extraHours: null,
            status: 'leave',
          },
        });
      }
    } catch (err) {
      // Defensive fallback for a genuine concurrent-insert race (a real check-in landing between
      // our SELECT and INSERT within this same transaction's snapshot) — treat as a skip rather
      // than fail the whole approval.
      if (err.code === 'P2002') {
        skippedDates.push(dateStr);
        continue;
      }
      throw err;
    }
  }

  return { skippedDates };
}

module.exports = { syncApprovedLeaveToAttendance, enumerateDates };
