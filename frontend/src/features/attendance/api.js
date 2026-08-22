import { API_BASE_URL } from '../../app/apiBase';

async function request(path, { method = 'GET', accessToken, body } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }
  return data;
}

// Every call below acts only on the caller's own profile server-side (see backend routes.js) —
// no employee id is ever sent from here, by design, not merely by omission.
export function fetchToday(accessToken) {
  return request('/attendance/today', { accessToken });
}

export function checkIn(accessToken) {
  return request('/attendance/check-in', { method: 'POST', accessToken });
}

export function checkOut(accessToken) {
  return request('/attendance/check-out', { method: 'POST', accessToken });
}

export function fetchMyMonth(accessToken, month) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  return request(`/attendance/me${qs}`, { accessToken });
}

// Admin-only server-side (requireRole('admin_hr')) — see backend routes.js.
export function fetchAdminList(accessToken, { date, search } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (search) params.set('search', search);
  const qs = params.toString();
  return request(`/attendance${qs ? `?${qs}` : ''}`, { accessToken });
}
