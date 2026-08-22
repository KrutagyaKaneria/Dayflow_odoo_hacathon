import { API_BASE_URL } from '../../app/apiBase';

async function request(path, { method = 'GET', accessToken, body, isFormData } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }
  return data;
}

// Employee id is never sent — every call acts on the caller's own profile server-side, same
// construction as Phase 06's attendance check-in/out.
export function submitLeave(accessToken, payload) {
  return request('/leaves', { method: 'POST', accessToken, body: payload });
}

export function fetchMyLeaves(accessToken, year) {
  const qs = year ? `?year=${year}` : '';
  return request(`/leaves/me${qs}`, { accessToken });
}

export function fetchBalance(accessToken) {
  return request('/leaves/balance', { accessToken });
}

export function uploadAttachment(accessToken, file) {
  const formData = new FormData();
  formData.append('attachment', file);
  return request('/leaves/attachment', { method: 'POST', accessToken, body: formData, isFormData: true });
}

export function fetchHolidays(accessToken, year) {
  const qs = year ? `?year=${year}` : '';
  return request(`/holidays${qs}`, { accessToken });
}

// Admin-only server-side (requireRole('admin_hr')).
export function fetchAdminLeaves(accessToken, { status, search } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  return request(`/leaves${qs ? `?${qs}` : ''}`, { accessToken });
}

export function decideLeave(accessToken, id, action, adminComment) {
  return request(`/leaves/${id}/${action}`, {
    method: 'PATCH',
    accessToken,
    body: adminComment ? { adminComment } : {},
  });
}

export function fetchAllocations(accessToken) {
  return request('/leaves/allocations', { accessToken });
}
