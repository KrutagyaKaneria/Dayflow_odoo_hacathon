const { sendError } = require('../../shared/response');
const { verifyAccessToken } = require('./tokens');

// Populates req.user from a Bearer access token. This is NOT RBAC — it only answers "who is this,"
// not "are they allowed to do this." Authorization enforcement is Phase 03.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Missing or malformed Authorization header.');
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, organizationId: payload.organizationId ?? null };
    return next();
  } catch (err) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired access token.');
  }
}

// TEMP - Phase 02 placeholder only. Replace with real RBAC middleware in Phase 03.
// Do not extend this pattern to any other endpoint.
function requireAdminHrTemp(req, res, next) {
  if (!req.user || req.user.role !== 'admin_hr') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin/HR role required' } });
  }
  return next();
}

module.exports = { authenticate, requireAdminHrTemp };
