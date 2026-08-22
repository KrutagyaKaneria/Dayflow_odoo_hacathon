/**
 * Phase 10 — Security Hardening, item 3 (D-23). Single write path for the audit_log table —
 * every caller (payroll upsert, admin profile edit, leave approve/reject, provisioning) goes
 * through recordAuditEvent so the redaction discipline below is enforced in exactly one place,
 * not re-implemented per call site.
 *
 * `metadata` must NEVER contain: raw bank account_number/pan_no/uan_no (even encrypted-at-rest,
 * the audit log is a second place the value could leak from — omit the field entirely, don't
 * even store the ciphertext), password/password hashes, or access/refresh tokens. Callers pass
 * only non-sensitive shape info (which fields changed, old/new for non-sensitive fields, role,
 * decision outcome) — see each call site for what's actually recorded.
 *
 * Pass `tx` (a Prisma transaction client) when the caller already has one open, so the audit
 * entry commits atomically with the change it's recording — a salary edit and its audit record
 * must never be able to diverge (one succeeding, the other silently not). Falls back to the
 * top-level `prisma` client for callers with no transaction (e.g. leave decide()).
 */
const { prisma } = require('../../config/db');

async function recordAuditEvent(tx, { actorUserId, action, targetType, targetId, metadata }) {
  const client = tx || prisma;
  await client.auditLog.create({
    data: {
      actorUserId: actorUserId ?? null,
      action,
      targetType,
      targetId: targetId ?? null,
      metadata: metadata ?? {},
    },
  });
}

module.exports = { recordAuditEvent };
