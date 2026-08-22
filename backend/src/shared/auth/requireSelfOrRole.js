const { sendError } = require('../response');

// Generic "caller may act on their own resource, or a privileged role may act on anyone's"
// primitive. No endpoint in this phase uses it yet (no profile/attendance/leave/payroll routes
// exist as of Phase 03) — Phase 04 onward is expected to import this directly rather than write
// its own ownership check.
//
// getResourceOwnerId(req) returns (or resolves to) the resource's owning user id — e.g. a route
// param for a resource keyed directly by user id, or a DB lookup for one that isn't. May be sync
// or async.
//
// Must run after requireAuth, for the same reason as requireRole. D-20 [CONFIRMED Phase 10]:
// 403 on failure, same convention as requireRole — see requireAuth.js.
function requireSelfOrRole(getResourceOwnerId, ...allowedRoles) {
  return async function (req, res, next) {
    if (!req.user) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }
    try {
      const ownerId = await getResourceOwnerId(req);
      if (ownerId != null && ownerId === req.user.id) {
        return next();
      }
    } catch (err) {
      return next(err);
    }
    return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  };
}

module.exports = { requireSelfOrRole };
