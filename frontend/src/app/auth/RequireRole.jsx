import { useAuth } from './AuthContext';

// Convenience/UX helper only — hides UI a role shouldn't see. This is NEVER the security
// boundary; the actual enforcement is the backend's requireRole (src/shared/auth/requireRole.js,
// Phase 03). A user could always disable JS or hit the API directly, so every endpoint this
// gates client-side must independently gate itself server-side too.
//
// No real screen wraps this yet as of Phase 03 (no protected routes exist) — built ready for
// Phase 04/05 to import directly.
export function RequireRole({ roles, fallback = null, children }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return fallback;
  return children;
}
