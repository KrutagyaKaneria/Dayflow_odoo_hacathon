// Pure helpers for the employee full-year calendar (R-D17) — kept out of YearCalendar.jsx for
// the same testability reason as attendance's monthUtils.js/dateUtils.js (see
// scripts/smoke-leave.mjs). All dates are 'YYYY-MM-DD' strings handled in UTC to avoid
// timezone off-by-ones; this is calendar rendering only, NOT day-count arithmetic (that lives
// in dayCountPreview.js / backend leavePolicy.js per D-30).

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Week starts Monday — arbitrary (neither source specifies); documented rather than silent.
export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateKey(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

// One month's cells: leading nulls for the Monday-first offset, then one { date, dayOfMonth }
// per real day. Nulls render as blanks.
export function buildMonthGrid(year, monthIndex) {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  // getUTCDay() is Sunday-first; convert to Monday-first index.
  const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: toDateKey(year, monthIndex, day), dayOfMonth: day });
  }
  return cells;
}

export function buildYearMonths(year) {
  return MONTH_LABELS.map((label, monthIndex) => ({
    label,
    cells: buildMonthGrid(year, monthIndex),
  }));
}

// [RECOMMENDATION] When a rejected request overlaps a later pending re-application for the same
// date (the server only prevents overlap among PENDING/APPROVED), the current state wins:
// approved > pending > rejected. A validated absence is definitive; a pending one is what is
// happening now; a rejection is history.
const STATUS_PRIORITY = { approved: 3, pending: 2, rejected: 1 };

// Expands the year's leave records into a Map of 'YYYY-MM-DD' -> status. Requests spanning a
// year boundary are clamped to this year's dates (GET /leaves/me scopes by start_date, so a
// cross-boundary record can still reach into this year's grid).
export function buildLeaveDayMap(records) {
  const byDate = new Map();
  for (const record of records || []) {
    if (!STATUS_PRIORITY[record.status]) continue;
    const start = new Date(`${String(record.startDate).slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${String(record.endDate).slice(0, 10)}T00:00:00.000Z`);
    for (let t = start.getTime(); t <= end.getTime(); t += 1000 * 60 * 60 * 24) {
      const d = new Date(t);
      if (d.getUTCFullYear() !== Number(String(record.startDate).slice(0, 4))) continue;
      const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
      const existing = byDate.get(key);
      if (!existing || STATUS_PRIORITY[record.status] > STATUS_PRIORITY[existing]) {
        byDate.set(key, record.status);
      }
    }
  }
  return byDate;
}

// Set of 'YYYY-MM-DD' keys from GET /holidays' [{ id, date, name }] shape.
export function buildHolidayDateSet(holidays) {
  return new Set((holidays || []).map((h) => String(h.date).slice(0, 10)));
}
