/**
 * Phase 09 — centralized cross-module integration policy. This module is the first and only
 * one permitted to read across attendance/leave/payroll boundaries. Every invented rule for
 * cross-module derivation lives here — no formula literal elsewhere.
 */

// [RECOMMENDATION resolving D-12 toward "build now"] The [DESIGN] note states attendance data
// "serves as the basis for payslip generation" and that unpaid leave or missing attendance
// "should automatically reduce the number of payable days". [PDF §6] defers "salary slips" — the
// DOCUMENT — to Future Enhancements. These are separable: the payable-days FIGURE is a
// calculation over data that already exists; the payslip is a rendered artifact. Building the
// figure now keeps the calculation honest while the data producing it is fresh in the codebase;
// deferring it risks Phases 06-08's arithmetic decisions (D-29, D-30, D-35) being finalised
// without anyone ever checking they compose correctly.
// TODO(D-12): if deferred instead, payableDays.js and its endpoint are removed wholesale — they
// have no consumers outside themselves, except attendance/me's totalWorkingDays, which would
// then need to go back to returning null with its Phase 06 marker.

// [RECOMMENDATION pending D-40 — NEW] Directory status-icon precedence. The design's legend
// describes three states as if mutually exclusive, but they are not: an employee can have an
// APPROVED leave for today AND a check-in record for today (they came in anyway, or the leave
// was approved retroactively after they had worked). Nothing in either source states which wins.
// This phase resolves in this order, first match wins:
//   1. Has an attendance record for today with check_in_at  -> PRESENT (green)
//   2. Has an APPROVED leave covering today                 -> ON_LEAVE (airplane)
//   3. Otherwise                                            -> ABSENT (yellow)
// Reasoning: an actual check-in is observed fact; an approved leave is an intention. Where they
// disagree, the observed fact is the more truthful thing to display on a "who is in the office"
// indicator. A PENDING leave never wins either branch — only APPROVED counts.
// TODO(D-40): confirm. The opposite precedence is defensible if the icon is meant to communicate
// entitlement rather than presence.
const STATUS_ICON_PRECEDENCE = ['present', 'on_leave', 'absent'];

// [RECOMMENDATION pending D-39 — NEW] Collision between an approved leave and an existing
// attendance record on the same date. Neither source addresses this at all. Resolution adopted:
//   - Date has NO attendance record       -> INSERT a row with status LEAVE, both timestamps
//                                             NULL, work/extra hours NULL.
//   - Date HAS a record with a check-in   -> DO NOT OVERWRITE. Leave the attendance record
//                                             exactly as it is, and report the conflict (the
//                                             date is returned in the approve response's
//                                             attendanceSyncSkippedDates, never silently dropped).
// Reasoning: overwriting destroys an observed check-in — real data — in favour of a derived
// status, and it is not recoverable, since Phase 06 stores no history and Phase 10's audit log
// (D-23) does not exist yet. The same reasoning as D-40: observed fact outranks intention.
// TODO(D-39): confirm. If overwrite is intended, it MUST wait for an audit trail decision, or
// approved leave will silently erase check-in records with no record that it happened.
const OVERWRITE_ATTENDANCE_ON_LEAVE_APPROVAL = false;

// Sync runs INLINE within the approval transaction (PATCH /leaves/:id/approve), not as a
// background job — [PDF §3.5.2] says "immediately", and neither source describes any
// asynchronous behavior anywhere in the system. Rejection never un-syncs: a PENDING request
// never wrote attendance rows, so there is nothing to reverse.
// TODO(D-33): if cancellation of an already-APPROVED leave is ever resolved toward allowing it,
// reversal logic becomes necessary — it does not exist here.

// Weekends and public holidays inside an approved leave range get LEAVE rows written too — every
// calendar date in the range, matching Phase 07's EXCLUDE_WEEKENDS_FROM_DAY_COUNT = false
// default. Changing one without the other would put the two modules' day counts out of
// agreement.
// TODO(D-30): these two defaults must move together.

// [RECOMMENDATION pending D-38 — NEW] The payable-days formula is INVENTED here. Neither the
// PDF nor the design specifies it beyond "unpaid leave or missing attendance days should reduce
// payable days". Everything in payableDays.js is a reasoned construction, not a discovered
// requirement, and every line of it is negotiable. See payableDays.js's own header for the full
// formula and the four upstream ambiguities it inherits.
// TODO(D-38): this formula must be confirmed by whoever owns payroll before any figure it
// produces is shown to an employee or used for payment.

module.exports = {
  STATUS_ICON_PRECEDENCE,
  OVERWRITE_ATTENDANCE_ON_LEAVE_APPROVAL,
};
