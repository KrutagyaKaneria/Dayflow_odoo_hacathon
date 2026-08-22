// TODO: move to a Vite env var (import.meta.env) once the frontend build config grows one —
// not scoped to this phase, matches the backend's default PORT (see backend/.env.example).
export const API_BASE_URL = 'http://localhost:4000';

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

export function fetchMyProfile(accessToken) {
  return request('/employees/me', { accessToken });
}

export function fetchProfileById(id, accessToken) {
  return request(`/employees/${id}`, { accessToken });
}

// Always PATCHes /employees/me, regardless of the caller's role — that's the only self-edit
// endpoint (see backend/src/modules/employees/routes.js); PATCH /employees/:id is Admin-only
// and this phase's UI never calls it (no "edit someone else's profile" affordance exists yet).
export function updateMyProfile(accessToken, fields) {
  return request('/employees/me', { method: 'PATCH', accessToken, body: fields });
}

export function uploadAvatar(accessToken, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return request('/employees/me/avatar', { method: 'POST', accessToken, body: formData, isFormData: true });
}
