// Pure helpers for the Admin attendance view's date navigation (←/→). See monthUtils.js for why
// these are extracted rather than inlined.
export function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date, deltaDays) {
  const [year, mon, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 1, day + deltaDays));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// "22, October 2025" style, per [DESIGN].
export function formatDateHeader(date) {
  const [year, mon, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 1, day));
  const month = d.toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' });
  return `${day}, ${month} ${year}`;
}
