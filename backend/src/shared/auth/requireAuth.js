const { sendError } = require('../response');
const { verifyAccessToken } = require('../../modules/auth/tokens');

// D-20 [CONFIRMED Phase 10]: convention adopted Phase 03, applied uniformly through Phase 09, and
// re-verified during Phase 10's RBAC re-audit across every Phase 02-09 endpoint:
// 401 Unauthorized -> no valid token at all (this middleware's failure mode)
// 403 Forbidden     -> valid token, but wrong role or not the resource owner (requireRole / requireSelfOrRole)
// Both use the shared error envelope from Phase 01: { error: { code, message } }

// Populates req.user from a Bearer access token. Reuses Phase 02's verifyAccessToken — the JWT
// verification logic itself is not duplicated here, only the Express middleware wrapper is.
// This answers "who is this," not "are they allowed to do this" — see requireRole / requireSelfOrRole
// for the "allowed to" checks that must run after this in the middleware chain.
function requireAuth(req, res, next) {
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

module.exports = { requireAuth };
