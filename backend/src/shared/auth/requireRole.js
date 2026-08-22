const { sendError } = require('../response');

// D-20 [CONFIRMED Phase 10]: 403, not 401 — the caller has a valid identity (requireAuth already
// ran), they just don't hold an allowed role. See requireAuth.js for the full convention.
//
// Must run after requireAuth in the middleware chain, since it reads req.user. The `!req.user`
// branch is a defensive fail-closed check (403, not a crash) for the case where requireRole is
// ever wired without requireAuth ahead of it — it is not a substitute for requireAuth.
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }
    return next();
  };
}

module.exports = { requireRole };
