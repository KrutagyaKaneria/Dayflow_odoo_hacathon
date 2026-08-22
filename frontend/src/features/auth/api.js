import { API_BASE_URL } from '../../app/apiBase';

export async function signIn(identifier, password) {
  const res = await fetch(`${API_BASE_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Sign in failed (${res.status})`);
  }
  return data;
}

// Best-effort: the refresh-token cookie Phase 02 sets is SameSite=Lax, so it won't reach a
// cross-origin fetch from a frontend dev server on a different port — that's a pre-existing
// Phase 02/03 architecture detail, not something this phase changes. The backend still returns
// 200 and clears what it can; the frontend's own session clear (see TopNav.jsx) is what actually
// matters for the user's experience of "being logged out."
export async function logout(accessToken) {
  const res = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}
