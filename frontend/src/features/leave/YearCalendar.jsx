import { STATUS_LABELS } from './statusLabels';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year, monthIdx) {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

function dateKey(year, monthIdx, day) {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Pure, exported for testability — see scripts/smoke-leave.mjs. Maps every calendar day inside
// each request's [startDate, endDate] range (inclusive) to that request's status.
export function buildDayStatusMap(records) {
  const map = new Map();
  for (const record of records) {
    const start = new Date(record.startDate);
    const end = new Date(record.endDate);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      map.set(d.toISOString().slice(0, 10), record.status);
    }
  }
  return map;
}

export function buildHolidaySet(holidays) {
  return new Set(holidays.map((h) => h.date.slice(0, 10)));
}

// [DESIGN] R-D17: full-year calendar with day cells colored by request status, plus the
// Validated/To Approve/Refused legend (rendered via STATUS_LABELS, a presentation-only mapping
// over the PDF's stored enum — see statusLabels.js), and holiday dates visually distinguished.
export function YearCalendar({ year, records, holidays }) {
  const dayStatus = buildDayStatusMap(records);
  const holidaySet = buildHolidaySet(holidays);

  return (
    <div className="year-calendar">
      <div className="year-calendar__grid">
        {MONTH_NAMES.map((name, monthIdx) => (
          <MonthGrid key={name} year={year} monthIdx={monthIdx} name={name} dayStatus={dayStatus} holidaySet={holidaySet} />
        ))}
      </div>
      <Legend />
      {holidays.length > 0 && (
        <div className="year-calendar__holiday-list">
          <h4>Public Holidays</h4>
          <ul>
            {holidays.map((h) => (
              <li key={h.id}>
                {h.date.slice(0, 10)} — {h.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MonthGrid({ year, monthIdx, name, dayStatus, holidaySet }) {
  const total = daysInMonth(year, monthIdx);
  const days = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="month-grid">
      <h4>{name}</h4>
      <div className="month-grid__days">
        {days.map((day) => {
          const key = dateKey(year, monthIdx, day);
          const status = dayStatus.get(key);
          const isHoliday = holidaySet.has(key);
          const classes = ['month-grid__day'];
          if (status) classes.push(`month-grid__day--${status}`);
          if (isHoliday) classes.push('month-grid__day--holiday');
          const title = isHoliday ? 'Public holiday' : status ? STATUS_LABELS[status] : undefined;
          return (
            <span key={day} className={classes.join(' ')} title={title}>
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="year-calendar__legend">
      {Object.entries(STATUS_LABELS).map(([status, label]) => (
        <span key={status} className={`legend-item legend-item--${status}`}>
          {label}
        </span>
      ))}
      <span className="legend-item legend-item--holiday">Public Holiday</span>
    </div>
  );
}
