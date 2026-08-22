/**
 * Phase 07 — centralized leave policy. Every open-decision value this phase had to pick a
 * default for lives here — no day-count, threshold, or default-allocation literal appears
 * anywhere else in the codebase. Follows the EMPLOYEE_EDITABLE_FIELDS (Phase 04) /
 * attendancePolicy.js (Phase 06) precedent.
 */

// [RECOMMENDATION resolving D-04 and D-05 toward the PDF] Remarks (employee, on application)
// and Admin comments (on approve/reject) ARE built this phase. Reasoning, so a reviewer can
// disagree with the reasoning rather than just the outcome: the PDF states both as explicit
// capabilities (§3.5.1 "Add remarks", §3.5.2 "Add comments"). The design does not contradict
// them — it simply does not draw them. Absence from a wireframe is weaker evidence than
// presence in a requirements document, and the asymmetry of cost is decisive: adding two
// nullable text columns now is trivial, while retrofitting them later means a migration plus
// backfilling every historical request with NULL context that can never be recovered.
// Both are OPTIONAL (nullable, never required) — neither source marks them mandatory, so
// enforcing them would be inventing a requirement.
// TODO(D-04): if the decision goes the other way, hide the Remarks field in the UI and stop
// writing it; do not drop the column, since data already written would be lost.
// TODO(D-05): same as above, for the Admin comment field.

// [RECOMMENDATION pending D-30 — NEW] How many days a leave request consumes. The design's ONLY
// worked example is internally ambiguous: Validity Period "May 13" to "May 14" shown with
// Allocation "01.00 Days". Inclusive counting of 13th and 14th gives 2 days, not 1. Three
// readings are possible:
//   (a) end date is EXCLUSIVE (13th only)     -> 1 day  ✅ matches the mockup
//   (b) inclusive, and the value is a manual override, not computed
//   (c) inclusive with half-day support, and the example is a half-day pair
// The prior analysis assumed Allocation is auto-computed [INFERENCE]; that inference is
// contradicted by the only example in the source.
// This phase implements INCLUSIVE counting (the near-universal HR convention, and the only
// reading under which a same-day leave request equals 1 day rather than 0), which means the
// design's example WILL NOT reproduce. That divergence is intentional and must be reported, not
// silently reconciled.
// TODO(D-30): confirm before Phase 09 — payable-days inherits this arithmetic.
const DAY_COUNT_INCLUSIVE = true;

// [RECOMMENDATION pending D-30] Whether weekends and public holidays falling inside a range are
// excluded from the day count. NEITHER source says anything. This phase counts ALL calendar days
// in the range, excluding nothing, because excluding weekends requires the working-days-per-week
// value that lives on the Phase 08 salary structure and does not exist yet — the same missing
// input that forced Phase 06 to stub totalWorkingDays as null.
// Do NOT approximate with a hardcoded Mon-Fri assumption.
// TODO(D-30): revisit once Phase 08 provides working-days-per-week.
const EXCLUDE_HOLIDAYS_FROM_DAY_COUNT = false;
const EXCLUDE_WEEKENDS_FROM_DAY_COUNT = false;

// [INFERENCE] Half-day leave is NOT supported. The design's "01.00 Days" decimal formatting
// hints it might be, but no half-day affordance is drawn in the modal and no rule is stated. Day
// counts are whole numbers stored in a decimal column so half-day support is a data change, not
// a migration, if later adopted.
const ALLOW_HALF_DAY_LEAVE = false;

// [RECOMMENDATION pending D-32 — NEW] When a leave request consumes balance. Neither source
// states this. This phase tracks THREE figures per employee per leave type: daysAllocated,
// daysUsed (APPROVED requests only), daysPending (PENDING requests). Available = allocated -
// used - pending. Pending requests are counted against availability so an employee cannot
// submit 30 days of pending requests against a 24-day balance and have them all approved later.
// Rejection releases the pending days; approval moves them from pending to used.
// TODO(D-32): confirm. The alternative (deduct only on approval) is simpler but allows
// over-booking that only surfaces at approval time.

// [RECOMMENDATION pending D-08] Balance is ADVISORY, not hard-enforced. A request exceeding
// available days is accepted and flagged (exceedsBalance: true in the response) rather than
// rejected with a 4xx. Reasoning: the design displays balances but draws no error state, no
// warning, and no blocked-submission path, and UNPAID_LEAVE exists precisely as the escape
// valve for exhausted balances — hard-blocking would make unpaid leave unusable once paid leave
// runs out.
// TODO(D-08): if hard enforcement is chosen, this is a single branch in the POST /leaves
// handler; the exceedsBalance calculation already exists either way.
const ENFORCE_BALANCE_HARD_LIMIT = false;

// [RECOMMENDATION pending D-09] The Admin "Allocation" sub-tab is built READ-ONLY this phase: it
// lists every employee's per-type allocated/used/pending/available figures. No editing UI, no
// allocation-adjustment endpoint. The design shows the tab exists but never expands it — its
// contents, fields, and edit affordances are entirely undrawn, so an editable version would be
// invented wholesale.
// TODO(D-09): decide what Admin can actually configure — per-employee overrides? company-wide
// defaults? accrual rules? None of these are hinted at by either source.

// [RECOMMENDATION pending D-11] Public holidays are stored in a table scoped by
// organization_id (nullable — NULL means a global/default holiday set), seeded with the nine
// India-specific dates the design lists. This shape supports both outcomes: if holidays turn
// out to be per-company configurable, rows get an organization_id; if global, they stay NULL.
// No admin CRUD UI is built.
// TODO(D-11): confirm per-company vs. global before building any management UI.

// [RECOMMENDATION, R-D16] The attachment field is available for ALL leave types and REQUIRED
// for none. The design annotates it "(For sick leave certificate)", which describes its
// purpose, not an enforcement rule — the prior analysis flagged requiring-it-for-sick-leave as
// [INFERENCE], not a stated requirement. Making it mandatory would block a same-day sick request
// from an employee who has not yet seen a doctor.
// TODO: confirm whether sick leave should hard-require an attachment.
const REQUIRE_ATTACHMENT_FOR_SICK_LEAVE = false;

// [RECOMMENDATION] Overlapping requests: a new request whose date range overlaps an existing
// PENDING or APPROVED request for the same employee is REJECTED with 409
// OVERLAPPING_LEAVE_REQUEST. Neither source specifies this, but permitting overlap makes the
// day-count and balance arithmetic ambiguous (the same date consumed twice), which would
// corrupt Phase 09's payable-days.
// TODO: confirm. This is the one unstated rule this phase enforces strictly, because the
// alternative produces bad DATA, not just bad UX.

// [RECOMMENDATION pending D-33 — NEW] Employee cancellation/edit of a PENDING request is NOT
// built. Neither source shows a CANCELLED state, a cancel button, or an edit path, and the
// prior analyses flagged its total absence in both. The status enum therefore has exactly the
// three PDF values.
// TODO(D-33): a real HRMS almost certainly needs this. Adding a CANCELLED value later is an
// enum migration — flag it now rather than discovering it in UAT.

// [INFERENCE] The design's calendar legend reads "To Approve / Validated / Refused". The prior
// analysis inferred these are the same three states under different display labels, and
// explicitly noted this is NOT confirmed anywhere. This phase treats them as a
// PRESENTATION-LAYER MAPPING ONLY — the database and API use the PDF's enum; the calendar
// legend renders the design's labels via a single mapping constant in the frontend (see
// frontend/src/features/leave/statusLabels.js).
// TODO: if these are genuinely distinct concepts (e.g. "Validated" meaning a verification step
// separate from approval), the state machine is wrong and this is a schema change, not a label
// change. Confirm.

// Seed defaults from the design's displayed figures. unpaid_leave gets NO balance row at all —
// unpaid leave is by definition unbounded, and the design shows only two balance banners.
// TODO(D-09): confirm 24/7 are intended defaults for every employee rather than the mockup's
// arbitrary sample values.
const DEFAULT_ALLOCATIONS = {
  paid_time_off: 24,
  sick_leave: 7,
};

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toDateOnlyString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

// Pure. startDate/endDate may be Date objects, 'YYYY-MM-DD' strings, or full ISO timestamps —
// only the calendar-date portion is used. Per D-30: inclusive, no weekend/holiday exclusion.
function countDays(startDate, endDate) {
  const start = new Date(`${toDateOnlyString(startDate)}T00:00:00.000Z`);
  const end = new Date(`${toDateOnlyString(endDate)}T00:00:00.000Z`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const days = DAY_COUNT_INCLUSIVE ? diffDays + 1 : diffDays;
  return round2(days);
}

// Pure. Both ranges given as [start, end] date-only strings/Dates, inclusive on both ends.
// Adjacent-but-not-overlapping ranges (one ends the day before the other starts) do NOT count
// as overlapping.
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const a1 = toDateOnlyString(aStart);
  const a2 = toDateOnlyString(aEnd);
  const b1 = toDateOnlyString(bStart);
  const b2 = toDateOnlyString(bEnd);
  return a1 <= b2 && b1 <= a2;
}

// Pure. `requests` is an array of { status, daysCount } for one employee/leave-type pair —
// status must already be filtered to whatever set the caller cares about (typically all
// non-rejected requests for the type). allocated may be undefined/null for a type with no
// balance row (unpaid_leave) — callers must check for that before calling this.
function deriveBalance(allocated, requests) {
  const used = requests
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + Number(r.daysCount), 0);
  const pending = requests
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + Number(r.daysCount), 0);
  const allocatedNum = allocated == null ? 0 : Number(allocated);
  return {
    allocated: allocated == null ? null : round2(allocatedNum),
    used: round2(used),
    pending: round2(pending),
    available: allocated == null ? null : round2(allocatedNum - used - pending),
  };
}

// dev-seed.js only backfills leave_balances rows for employees that already exist when it runs
// (per its own documented precedent, it creates zero employee_profiles itself — see
// src/db/seeds/dev-seed.js) — an employee provisioned afterward would have no row at all until
// the seed script is re-run manually. Rather than let that gap show up as a broken-looking 0/0
// balance, DEFAULT_ALLOCATIONS is also the live application-level fallback: a leave type with no
// leave_balances row falls back to its default allocation, UNLESS the type is unpaid_leave,
// which has no row by design (unbounded), not by omission. This is the one place that
// distinction is made — see service.js, which always resolves allocation through this function
// rather than reading balanceRow.daysAllocated directly.
function resolveAllocatedDays(leaveType, balanceRow) {
  if (balanceRow) return Number(balanceRow.daysAllocated);
  if (leaveType === 'unpaid_leave') return null;
  return Object.prototype.hasOwnProperty.call(DEFAULT_ALLOCATIONS, leaveType)
    ? DEFAULT_ALLOCATIONS[leaveType]
    : null;
}

module.exports = {
  DAY_COUNT_INCLUSIVE,
  EXCLUDE_HOLIDAYS_FROM_DAY_COUNT,
  EXCLUDE_WEEKENDS_FROM_DAY_COUNT,
  ALLOW_HALF_DAY_LEAVE,
  ENFORCE_BALANCE_HARD_LIMIT,
  REQUIRE_ATTACHMENT_FOR_SICK_LEAVE,
  DEFAULT_ALLOCATIONS,
  countDays,
  rangesOverlap,
  deriveBalance,
  resolveAllocatedDays,
  toDateOnlyString,
};
