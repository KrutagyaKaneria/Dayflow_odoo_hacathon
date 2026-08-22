import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useDebouncedValue } from '../../app/useDebouncedValue';
import { fetchAdminList } from './api';
import { todayDate, shiftDate, formatDateHeader } from './dateUtils';
import './AttendancePage.css';

// [RECOMMENDATION] Same 300ms debounce as Phase 05's directory search.
const SEARCH_DEBOUNCE_MS = 300;

function formatTime(isoString) {
  return isoString ? new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function formatHours(value) {
  if (value == null) return '—';
  const h = Math.floor(value);
  const m = Math.round((value - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// [DESIGN] R-D09: day-scoped by default, with date navigation, across all employees.
export function AdminAttendancePage() {
  const { accessToken } = useAuth();
  const [date, setDate] = useState(todayDate);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    fetchAdminList(accessToken, { date, search: debouncedSearch })
      .then((data) => {
        setRecords(data.records);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, date, debouncedSearch]);

  return (
    <div className="attendance-page">
      <div className="attendance-page__toolbar">
        <input
          type="search"
          className="attendance-page__search"
          placeholder="Search employees…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {/* [UNCLEAR] The design draws a "Date ▼ / Day" toggle here but annotates neither option,
            and neither is described anywhere in either source. Rendered as a visual element
            only — day-scoped is the only functional mode this phase.
            TODO: clarify what the second mode does before wiring it — likely related to D-27's
            weekly-view question. */}
        <div className="attendance-page__view-toggle" title="Not wired — see TODO in source">
          <span className="is-active">Day</span>
          <span>Date ▾</span>
        </div>
      </div>

      <div className="attendance-page__header">
        <button type="button" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Previous day">
          ←
        </button>
        <span className="attendance-page__month-label">{formatDateHeader(date)}</span>
        <button type="button" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="Next day">
          →
        </button>
      </div>

      {loading && <p className="attendance-page__notice">Loading…</p>}
      {error && <p className="attendance-page__notice attendance-page__notice--error">{error}</p>}
      {/* [RECOMMENDATION] Empty state — Global Checklist §6; neither source draws this. */}
      {!loading && !error && records.length === 0 && (
        <p className="attendance-page__notice">No attendance recorded for this date.</p>
      )}

      {!loading && !error && records.length > 0 && (
        <table className="attendance-table">
          <thead>
            <tr>
              <th>Emp</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Work Hours</th>
              <th>Extra Hours</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.employee.name}</td>
                <td>{formatTime(record.checkInAt)}</td>
                <td>{formatTime(record.checkOutAt)}</td>
                <td>{formatHours(record.workHours)}</td>
                <td>{formatHours(record.extraHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
