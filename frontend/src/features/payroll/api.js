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
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export function fetchMyPayroll(accessToken) {
  return request('/payroll/me', { accessToken });
}

// Admin-only server-side (requireRole('admin_hr')) — see backend routes.js.
export function fetchPayrollForEmployee(accessToken, employeeId) {
  return request(`/payroll/${employeeId}`, { accessToken });
}

export function updatePayroll(accessToken, employeeId, payload) {
  return request(`/payroll/${employeeId}`, { method: 'PATCH', accessToken, body: payload });
}

// Never persists — drives live recalculation on wage/component change without the frontend
// reimplementing calculateSalary.js.
export function previewPayroll(accessToken, employeeId, payload) {
  return request(`/payroll/${employeeId}/preview`, { method: 'POST', accessToken, body: payload });
}
