-- Migration: create_audit_log
-- Phase 10 — Security Hardening, item 3 (D-23). Append-only audit trail for salary changes,
-- admin profile edits, leave approve/reject, and account provisioning.

CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(100) NOT NULL,
    "target_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log"("target_type", "target_id");
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
