import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { logout as logoutRequest } from '../../features/auth/api';
import { useTodayAttendance } from '../../features/attendance/useTodayAttendance';
import { AttendanceWidget } from './AttendanceWidget';
import { isNavStatusDotGreen } from './attendanceStatusDot';
import './TopNav.css';

function navLinkClass({ isActive }) {
  return isActive ? 'top-nav__tab is-active' : 'top-nav__tab';
}

// Persistent top nav — first phase this exists. Wrapped in Phase 03's <RequireAuth> by AppShell,
// so every render of this component has a signed-in user.
export function TopNav() {
  const { accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const attendance = useTodayAttendance();
  const isCheckedInNow = isNavStatusDotGreen(attendance);

  async function handleLogout() {
    setMenuOpen(false);
    try {
      await logoutRequest(accessToken);
    } finally {
      logout();
      navigate('/signin', { replace: true });
    }
  }

  return (
    <header className="top-nav">
      {/* No endpoint exists yet that exposes organizations.logo_url to the frontend (Phase 01
          added the column, but no phase through 05 built a way to read it client-side) — a
          static wordmark is the fallback the Phase 05 spec allows for. */}
      <div className="top-nav__logo">Dayflow</div>

      <nav className="top-nav__tabs">
        <NavLink to="/" end className={navLinkClass}>
          Employees
        </NavLink>
        <NavLink to="/attendance" className={navLinkClass}>
          Attendance
        </NavLink>
        <NavLink to="/time-off" className={navLinkClass}>
          Time Off
        </NavLink>
      </nav>

      <AttendanceWidget attendance={attendance} />

      <div className="top-nav__account">
        <button
          type="button"
          className="top-nav__avatar-button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
        >
          <span className="top-nav__avatar" aria-hidden="true">
            👤
          </span>
          <span
            className={`top-nav__status-dot ${isCheckedInNow ? 'top-nav__status-dot--green' : 'top-nav__status-dot--red'}`}
            aria-hidden="true"
          />
        </button>
        {menuOpen && (
          <div className="top-nav__menu">
            <NavLink to="/profile/me" onClick={() => setMenuOpen(false)}>
              My Profile
            </NavLink>
            <button type="button" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
