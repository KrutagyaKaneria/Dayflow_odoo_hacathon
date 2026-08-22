import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { fetchBalance, fetchMyLeaves, fetchHolidays } from './api';
import { YearCalendar } from './YearCalendar';
import { LeaveRequestModal } from './LeaveRequestModal';
import './TimeOffPage.css';

// [DESIGN] R-D14: two balance banners driven by GET /leaves/balance — real derived numbers,
// never the mockup's hardcoded 24/07 (those are only the seeded DEFAULT_ALLOCATIONS starting
// point on the backend, not something the frontend hardcodes).
function BalanceBanner({ label, balance }) {
  return (
    <div className="balance-banner">
      <span className="balance-banner__label">{label}</span>
      <span className="balance-banner__value">{balance ? `${balance.available} Days Available` : '—'}</span>
    </div>
  );
}

export function EmployeeTimeOffPage() {
  const { accessToken } = useAuth();
  const [year] = useState(() => new Date().getFullYear());
  const [balance, setBalance] = useState(null);
  const [records, setRecords] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  function reload() {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([fetchBalance(accessToken), fetchMyLeaves(accessToken, year), fetchHolidays(accessToken, year)])
      .then(([balanceRes, leavesRes, holidaysRes]) => {
        setBalance(balanceRes.balance);
        setRecords(leavesRes.records);
        setHolidays(holidaysRes.holidays);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [accessToken, year]);

  return (
    <div className="time-off-page">
      <div className="time-off-page__banners">
        <BalanceBanner label="Paid time Off" balance={balance?.paid_time_off} />
        <BalanceBanner label="Sick time off" balance={balance?.sick_leave} />
        <button type="button" className="time-off-page__new" onClick={() => setModalOpen(true)}>
          + NEW
        </button>
      </div>

      {loading && <p className="time-off-page__notice">Loading…</p>}
      {error && <p className="time-off-page__notice time-off-page__notice--error">{error}</p>}

      {!loading && !error && (
        <>
          {/* [RECOMMENDATION] Empty state — Global Checklist §6; neither source draws this. The
              calendar (and any public holidays) still renders underneath even with zero
              requests. */}
          {records.length === 0 && <p className="time-off-page__notice">No time off requests for {year}.</p>}
          <YearCalendar year={year} records={records} holidays={holidays} />
        </>
      )}

      {modalOpen && (
        <LeaveRequestModal
          onClose={() => setModalOpen(false)}
          onSubmitted={() => reload()}
        />
      )}
    </div>
  );
}
