import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, RequireRole } from '../../app/auth';
import { useDebouncedValue } from '../../app/useDebouncedValue';
import { fetchEmployees, API_BASE_URL } from './api';
import { initials } from './initials';
import './DirectoryPage.css';

// [RECOMMENDATION] 300ms debounce — neither source specifies an interval.
const SEARCH_DEBOUNCE_MS = 300;

// [RECOMMENDATION pending D-02] Default: Employees directory is the universal post-login
// landing page, per the design's explicit instruction ("After login the user must land on this
// page"). The PDF's separate "Employee Dashboard" (cards: Profile/Attendance/Leave/Logout +
// recent activity) is NOT built this phase.
// TODO(D-02): if a hybrid is later decided (e.g., dashboard cards ABOVE the directory, or cards
// replacing it entirely for the Employee role), this is the single screen to revisit — the
// directory component and the landing-route wiring (main.jsx) are kept separate enough that
// swapping the landing route's content should not require touching the nav shell (AppShell/
// TopNav) itself.
//
// [RECOMMENDATION pending D-24] "Recent activity or alerts" (PDF §3.2.1) is not built this
// phase. No activity-log read model, no UI panel — see the Master Roadmap's own flagged overlap
// with the deferred Notifications feature (Phase 11).
// TODO(D-24): decide whether this is a minimal always-on panel (build now) or folded into
// Notifications (defer to Phase 11) before building anything here.
export function DirectoryPage() {
  const { accessToken, user } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    fetchEmployees(accessToken, { search: debouncedSearch })
      .then((data) => {
        setEmployees(data.employees);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, debouncedSearch]);

  function handleAddEmployeeClick() {
    // [RECOMMENDATION pending D-15] Role-gated (admin_hr only, via <RequireRole> below) but the
    // click itself is a stub — no Add-Employee form is drawn in either source document.
    // TODO(D-15): no Add-Employee screen is drawn in either source — its fields must be designed
    // fresh in whichever phase actually builds it (not currently assigned in the roadmap).
    window.alert('Add employee — coming soon');
  }

  return (
    <div className="directory-page">
      <div className="directory-page__header">
        <input
          className="directory-page__search"
          type="search"
          placeholder="Search employees…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <RequireRole roles={['admin_hr']}>
          <button type="button" className="directory-page__new" onClick={handleAddEmployeeClick}>
            + NEW
          </button>
        </RequireRole>
      </div>

      {loading && <p className="directory-page__notice">Loading…</p>}
      {error && <p className="directory-page__notice directory-page__notice--error">{error}</p>}
      {!loading && !error && employees.length === 0 && (
        <p className="directory-page__notice">No employees found</p>
      )}

      <div className="directory-page__grid">
        {employees.map((employee) => (
          <EmployeeCard key={employee.id} employee={employee} isSelf={employee.id === user?.id} />
        ))}
      </div>
    </div>
  );
}

function EmployeeCard({ employee, isSelf }) {
  return (
    // TODO(D-14): this will currently 403 for an Employee clicking a coworker's card, until D-14
    // is resolved and Phase 04's GET /employees/:id guard is revisited. Do not silently work
    // around this here (e.g. by hiding or disabling the click affordance for non-self cards
    // when the viewer is an Employee) — that would hide a real product decision behind a UI
    // choice. Leave the click live for every card and let the 403 surface; Phase 04's
    // ProfilePage already renders an error notice rather than crashing when the fetch fails.
    <Link className="employee-card" to={`/profile/${employee.id}`} title={isSelf ? `${employee.name} (you)` : employee.name}>
      {employee.avatarUrl ? (
        <img className="employee-card__avatar" src={`${API_BASE_URL}${employee.avatarUrl}`} alt="" />
      ) : (
        <div className="employee-card__avatar employee-card__avatar--placeholder">{initials(employee.name)}</div>
      )}
      <span className="employee-card__name">{employee.name}</span>
      <span
        className={`employee-card__status employee-card__status--${employee.statusIcon}`}
        title="Status unknown — Attendance/Leave not built yet (Phase 06/07/09)"
      />
    </Link>
  );
}
