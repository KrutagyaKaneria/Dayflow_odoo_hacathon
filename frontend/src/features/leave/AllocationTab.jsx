import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { fetchAllocations } from './api';

function formatBalance(b) {
  if (!b || b.allocated == null) return '—';
  return `${b.allocated} / ${b.used} / ${b.pending} / ${b.available}`;
}

// [RECOMMENDATION pending D-09] Read-only — no edit controls anywhere in this component. The
// design shows the Allocation tab exists but never expands it; an editable version would be
// invented wholesale. See backend/src/modules/leave/leavePolicy.js's D-09 comment.
export function AllocationTab() {
  const { accessToken } = useAuth();
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    fetchAllocations(accessToken)
      .then((data) => {
        setAllocations(data.allocations);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  if (loading) return <p className="time-off-page__notice">Loading…</p>;
  if (error) return <p className="time-off-page__notice time-off-page__notice--error">{error}</p>;
  if (allocations.length === 0) return <p className="time-off-page__notice">No employees found.</p>;

  return (
    <table className="time-off-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Paid Time Off (alloc / used / pending / avail)</th>
          <th>Sick Leave (alloc / used / pending / avail)</th>
        </tr>
      </thead>
      <tbody>
        {allocations.map((allocation) => (
          <tr key={allocation.employeeId}>
            <td>{allocation.name}</td>
            <td>{formatBalance(allocation.balances.paid_time_off)}</td>
            <td>{formatBalance(allocation.balances.sick_leave)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
