/**
 * Phase 03 — authorization primitives. Every future phase protecting a new endpoint should
 * import from here rather than writing its own role/ownership check. See ../README.md for the
 * 401-vs-403 convention these all share.
 */
const { requireAuth } = require('./requireAuth');
const { requireRole } = require('./requireRole');
const { requireSelfOrRole } = require('./requireSelfOrRole');

module.exports = { requireAuth, requireRole, requireSelfOrRole };
