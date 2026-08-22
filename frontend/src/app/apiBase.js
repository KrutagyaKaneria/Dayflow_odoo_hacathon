// Single shared API base URL for the whole frontend — introduced in Phase 04 (as a local
// constant in features/employees/api.js) and centralized here in Phase 05 since the new auth
// and directory API modules both need it too.
// TODO: move to a Vite env var (import.meta.env) once the frontend build config grows one.
export const API_BASE_URL = 'http://localhost:4000';
