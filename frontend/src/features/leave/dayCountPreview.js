// Frontend MIRROR of backend/src/modules/leave/leavePolicy.js's countDays() — the browser
// cannot import the CommonJS backend module directly, so the arithmetic is deliberately
// duplicated for the request modal's live "Allocation" preview (read-only, per [DESIGN]).
// The authoritative computation happens server-side in POST /leaves; this preview must never
// disagree with it.
// TODO(D-30): if a recorded decision flips the backend default (e.g. to the mockup's exclusive
// reading, where May 13 -> May 14 = 01.00 Days), change THIS file in the same commit — and see
// the named divergence test in scripts/smoke-leave.mjs, which pins both modules to 2.00 today.

// Mirrors DAY_COUNT_INCLUSIVE (D-30): inclusive counting — a same-day request is 1 day, not 0,
// which is the only reading under which single-day leave makes sense at all.
const DAY_COUNT_INCLUSIVE = true;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function toUtcMidnight(dateString) {
  const dateOnly = String(dateString).slice(0, 10);
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

export function countDaysPreview(startDate, endDate) {
  if (!startDate || !endDate) {
    return null;
  }
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return null; // end before start — the form validates before submission
  }
  const days = DAY_COUNT_INCLUSIVE ? diffDays + 1 : diffDays;
  return round2(days);
}
