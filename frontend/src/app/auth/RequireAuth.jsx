import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// D-20 [CONFIRMED Phase 10]: a router-aware redirect, not the Phase 03 placeholder — Phase 05
// introduced <BrowserRouter> and RequireAuth is now always rendered inside it (see AppShell.jsx),
// so the original window.location.assign('/signin') placeholder (a full page reload) was stale
// dev-only leftover code, not the intended production UX. <Navigate replace> performs a
// client-side SPA redirect instead.
//
// This is a convenience/UX helper only, same caveat as RequireRole — the backend's requireAuth
// (src/shared/auth/requireAuth.js, Phase 03) is the actual security boundary.
export function RequireAuth({ children }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/signin" replace />;
  return children;
}
