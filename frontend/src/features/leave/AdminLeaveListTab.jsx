import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useDebouncedValue } from '../../app/useDebouncedValue';
import { fetchAdminLeaves, decideLeave } from './api';
import { STATUS_LABELS, LEAVE_TYPE_LABELS } from './statusLabels';

// [RECOMMENDATION] Same 300ms debounce as Phase 05's directory / Phase 06's Admin attendance search.
const SEARCH_DEBOUNCE_MS = 300;

// [DESIGN] R-P13: search bar, table — Name | Start Date | End Date | Time off Type | Status —
// with inline approve/reject on PENDING rows and an optional comment, per D-05.
export function AdminLeaveListTab() {
  const { accessToken } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comments, setComments] = useState({});

  function reload() {
    if (!accessToken) return;
    setLoading(true);
    fetchAdminLeaves(accessToken, { search: debouncedSearch })
      .then((data) => {
        setRecords(data.records);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [accessToken, debouncedSearch]);

  async function handleDecide(id, action) {
    try {
      await decideLeave(accessToken, id, action, comments[id]);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <input
        type="search"
        className="time-off-page__search"
        placeholder="Search employees…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {loading && <p className="time-off-page__notice">Loading…</p>}
      {error && <p className="time-off-page__notice time-off-page__notice--error">{error}</p>}
      {/* [RECOMMENDATION] Empty state — neither source draws this. */}
      {!loading && !error && records.length === 0 && <p className="time-off-page__notice">No time off requests found.</p>}

      {!loading && !error && records.length > 0 && (
        <table className="time-off-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Time off Type</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.employee.name}</td>
                <td>{record.startDate.slice(0, 10)}</td>
                <td>{record.endDate.slice(0, 10)}</td>
                <td>{LEAVE_TYPE_LABELS[record.leaveType]}</td>
                <td>{STATUS_LABELS[record.status]}</td>
                <td>
                  {record.status === 'pending' && (
                    <div className="time-off-table__actions">
                      <input
                        type="text"
                        placeholder="Comment (optional)"
                        value={comments[record.id] || ''}
                        onChange={(e) => setComments((c) => ({ ...c, [record.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="time-off-table__approve"
                        aria-label="Approve"
                        onClick={() => handleDecide(record.id, 'approve')}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="time-off-table__reject"
                        aria-label="Reject"
                        onClick={() => handleDecide(record.id, 'reject')}
                      >
                        ✗
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
