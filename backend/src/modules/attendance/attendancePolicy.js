/**
 * Phase 06 — centralized attendance policy. Every open-decision value this phase had to pick a
 * default for lives here — no threshold, timezone, or standard-hours literal appears anywhere
 * else in the codebase. If any of D-06/D-25/D-26/D-29 changes, this is the only file to touch.
 */

// [RECOMMENDATION pending D-26] Timezone. All timestamps are stored as timestamptz in UTC. The
// *calendar date* an attendance record belongs to is derived by converting to a single
// configured application timezone, defaulting to 'Asia/Kolkata' (the design's public-holiday
// list is India-specific, so this is a reasoned default, not an arbitrary one). Read from env
// APP_TIMEZONE. Every "what day is it" question in this module routes through
// deriveAttendanceDate() below.
// TODO(D-26): neither source specifies timezone handling. Confirm before Phase 09 computes
// payable days, which will inherit this date-boundary logic wholesale.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

// [RECOMMENDATION pending D-29] Standard workday length, used to split elapsed time into work
// hours vs. extra hours.
// TODO(D-29): the design's example row is internally inconsistent — check-in 10:00, check-out
// 19:00 (9h elapsed) shown as Work Hours 09:00 AND Extra 01:00. Those cannot both derive from
// the same 9h span unless standard is 8h and one column is gross while the other is overage.
// This phase implements:
//   workHours  = full elapsed time (matches the design's 09:00 for a 10:00-19:00 span)
//   extraHours = max(0, elapsed - STANDARD_WORK_HOURS)
// which reproduces the design's numbers exactly when STANDARD_WORK_HOURS = 8. This is an
// [INFERENCE], not a stated rule. Confirm before Phase 09 uses either figure for payroll.
const STANDARD_WORK_HOURS = 8;

// [RECOMMENDATION pending D-06] Half-day derivation: threshold-based. An employee with a
// completed session below this many hours is HALF_DAY; at or above it, PRESENT. Neither source
// states any rule for this.
// TODO(D-06): confirm threshold-based vs. manual selection vs. omit entirely.
const HALF_DAY_THRESHOLD_HOURS = 4;

// [RECOMMENDATION pending D-25] One attendance record per employee per calendar date. A second
// check-in on a date that already has an open or closed record is rejected 409
// ALREADY_CHECKED_IN. Check-out without a matching open record is rejected 409 NOT_CHECKED_IN. A
// missed check-out leaves check_out_at NULL, work_hours NULL, and status PRESENT — no auto-close
// job, no midnight sweep.
// TODO(D-25): both sources are silent. Confirm whether multiple sessions per day (e.g. lunch
// break out/in) should be supported — if yes, the unique constraint on (employee_profile_id,
// attendance_date) must be dropped and the schema becomes one-row-per-session, which is a
// migration, not a config change.
const ALLOW_MULTIPLE_SESSIONS_PER_DAY = false;

// [RECOMMENDATION pending D-07] Admin manual attendance correction is NOT built this phase. No
// POST/PATCH/DELETE endpoint for admin-authored attendance rows exists. Neither source grants or
// denies this capability, and inventing an override path silently creates an unaudited way to
// alter data that Phase 09 will feed into payroll.
// TODO(D-07): if adopted later, it must land alongside an audit trail decision (D-23), not
// before it.

// [RECOMMENDATION pending D-27] Weekly view NOT built this phase. [PDF §3.4.1] explicitly
// requires "daily and weekly attendance views", but the design draws only day-scoped (Admin) and
// month-scoped (Employee) screens and draws no weekly view anywhere. This is a genuine
// PDF-vs-design conflict, not a gap. This phase builds the two views the design specifies, since
// they are the ones with concrete drawn layouts.
// TODO(D-27): decide whether a weekly view is added (reconcile toward PDF), or the design's two
// views are treated as satisfying the requirement (reconcile toward design).

// [RECOMMENDATION pending D-28] Breaks are NOT tracked as data this phase. The reconciled
// analysis notes the Employee attendance view shows records "including breaks", but no break
// fields appear in the Attendance Record in either source, and "Break Time" appears only on the
// Salary Info screen (Phase 08). No break columns are added.
// TODO(D-28): if breaks are genuinely tracked attendance data, this is a schema addition and
// likely interacts with D-25's one-session-per-day default.

// [STUB — Phase 09 territory] ABSENT and LEAVE are never written by Phase 06. A date with no
// attendance row is simply absent from query results; the list views render gaps as blank rows
// client-side rather than the backend fabricating ABSENT records against a working-day calendar
// that does not yet exist.
// TODO: revisit when Phase 07 (public holidays, D-11) and Phase 08 (working-days-per-week)
// provide the inputs a real absent-derivation needs.

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Converts any instant to its calendar date (YYYY-MM-DD) in APP_TIMEZONE. 'en-CA' formats as
// ISO-style YYYY-MM-DD, which is what makes this a one-liner rather than manual component
// extraction/reassembly.
function deriveAttendanceDate(instant) {
  return DATE_FORMATTER.format(instant instanceof Date ? instant : new Date(instant));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Pure. checkInAt/checkOutAt may be Date objects or anything `new Date()` accepts.
function computeHours(checkInAt, checkOutAt) {
  const elapsedMs = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const workHours = round2(elapsedHours);
  const extraHours = round2(Math.max(0, elapsedHours - STANDARD_WORK_HOURS));
  return { workHours, extraHours };
}

// Pure. Only ever called with a completed session's workHours — never invoked for LEAVE or
// ABSENT, which this phase never writes (see the module-level note above).
function deriveStatus(workHours) {
  return workHours < HALF_DAY_THRESHOLD_HOURS ? 'half_day' : 'present';
}

module.exports = {
  APP_TIMEZONE,
  STANDARD_WORK_HOURS,
  HALF_DAY_THRESHOLD_HOURS,
  ALLOW_MULTIPLE_SESSIONS_PER_DAY,
  deriveAttendanceDate,
  computeHours,
  deriveStatus,
};
