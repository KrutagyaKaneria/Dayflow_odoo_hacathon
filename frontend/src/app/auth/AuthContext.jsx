import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Single source of truth for client-side token storage — Phase 02 built backend token issuance
// but no frontend storage mechanism yet, so this establishes the one going forward. Only the
// short-lived access token is kept here (localStorage); the refresh token lives solely in the
// httpOnly cookie that Phase 02's POST /auth/signin and /auth/refresh already set, so it is
// never read or written by frontend JS at all.
export const ACCESS_TOKEN_STORAGE_KEY = 'dayflow.accessToken';

// Decodes a JWT payload for UI purposes only (which nav items to show, etc.) — this is NOT a
// signature verification and must never be treated as an authorization decision. The backend's
// requireAuth (src/shared/auth/requireAuth.js, Phase 03) is the only place a token is actually
// verified; this just reads the claims a valid session already carries.
export function decodeAccessToken(token) {
  try {
    const [, payloadSegment] = token.split('.');
    const json = atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    if (!payload.sub) return null;
    return { id: payload.sub, role: payload.role, organizationId: payload.organizationId ?? null };
  } catch {
    return null;
  }
}

function readStoredUser() {
  if (typeof window === 'undefined') return { user: null, accessToken: null };
  const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (!token) return { user: null, accessToken: null };
  const user = decodeAccessToken(token);
  if (!user) return { user: null, accessToken: null };
  return { user, accessToken: token };
}

export const AuthContext = createContext(undefined);

// Wrap the app with this once real routing exists (Phase 05). Exposes the current user's
// { id, role, organizationId } (or null) and setAccessToken/logout for Sign In / Sign Out flows
// to call once those screens exist.
export function AuthProvider({ children }) {
  const [state, setState] = useState(readStoredUser);

  const setAccessToken = useCallback((token) => {
    if (!token) {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      setState({ user: null, accessToken: null });
      return;
    }
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    setState({ user: decodeAccessToken(token), accessToken: token });
  }, []);

  const logout = useCallback(() => setAccessToken(null), [setAccessToken]);

  const value = useMemo(
    () => ({ user: state.user, accessToken: state.accessToken, setAccessToken, logout }),
    [state, setAccessToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
