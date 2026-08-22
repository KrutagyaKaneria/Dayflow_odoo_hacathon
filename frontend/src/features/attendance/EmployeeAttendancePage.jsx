import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { fetchMyMonth } from './api';
import { currentMonth, shiftMonth, formatMonthLabel } from './monthUtils';
import './AttendancePage.css';

function formatTime(isoString) {
  return isoString ? new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function formatHours(value) {
  if (value == null) return '—';
  const h = Math.floor(value);
  const m = Math.round((value - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// [DESIGN] R-D10: month-scoped, day-wise, with summary chips.
export function EmployeeAttendancePage() {
  const { accessToken } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ daysPresent: 0, leavesCount: 0, totalWorkingDays: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    fetchMyMonth(accessToken, month)
      .then((data) => {
        setRecords(data.records);
        setSummary(data.summary);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, month]);

  return (
    <div className="attendance-page">
      <div className="attendance-page__header">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
          ←
        </button>
        <span className="attendance-page__month-label">{formatMonthLabel(month)}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
          →
        </button>
      </div>

      <div className="attendance-page__chips">
        <div className="attendance-chip">
          <span className="attendance-chip__label">Days Present</span>
          <span className="attendance-chip__value">{summary.daysPresent}</span>
        </div>
        {/* Phase 09: both figures are now real (see backend attendance/service.js) — leavesCount
            from the Leave→Attendance sync, totalWorkingDays from the shared payable-days
            helper. totalWorkingDays still honestly renders as "—" when null (no salary
            structure configured yet), never approximated. */}
        <div className="attendance-chip">
          <span className="attendance-chip__label">Leaves</span>
          <span className="attendance-chip__value">{summary.leavesCount}</span>
        </div>
        <div className="attendance-chip">
          <span className="attendance-chip__label">Total Working Days</span>
          <span className="attendance-chip__value">{summary.totalWorkingDays ?? '—'}</span>
        </div>
      </div>

      {loading && <p className="attendance-page__notice">Loading…</p>}
      {error && <p className="attendance-page__notice attendance-page__notice--error">{error}</p>}
      {/* [RECOMMENDATION] Empty state — Global Checklist §6; neither source draws this. */}
      {!loading && !error && records.length === 0 && (
        <p className="attendance-page__notice">No attendance recorded for this month.</p>
      )}

      {!loading && !error && records.length > 0 && (
        <table className="attendance-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Work Hours</th>
              <th>Extra Hours</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.attendanceDate.slice(0, 10)}</td>
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
