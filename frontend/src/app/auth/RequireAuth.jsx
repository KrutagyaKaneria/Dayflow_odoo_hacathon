import { useEffect } from 'react';
import { useAuth } from './AuthContext';

// [RECOMMENDATION pending D-20] No router exists yet (Phase 05 builds navigation), so a plain
// window.location redirect to /signin is the placeholder "redirect" behavior — swap for a
// router-aware redirect (e.g. react-router's <Navigate>) once Phase 05 introduces routing.
// TODO(D-20): confirm this UX before a real protected screen relies on it.
//
// This is a convenience/UX helper only, same caveat as RequireRole — the backend's requireAuth
// (src/shared/auth/requireAuth.js, Phase 03) is the actual security boundary.
export function RequireAuth({ children }) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      window.location.assign('/signin');
    }
  }, [user]);

  if (!user) return null;
  return children;
}
