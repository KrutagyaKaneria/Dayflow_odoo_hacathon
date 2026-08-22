import { Outlet } from 'react-router-dom';
import { RequireAuth } from '../auth';
import { TopNav } from './TopNav';
import './AppShell.css';

// First real usage of Phase 03's <RequireAuth> guard on an actual route (Phase 03/04 only had
// unwired standalone pages). Wraps every authenticated route from this phase forward with the
// persistent nav shell.
export function AppShell() {
  return (
    <RequireAuth>
      <div className="app-shell">
        <TopNav />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </RequireAuth>
  );
}
