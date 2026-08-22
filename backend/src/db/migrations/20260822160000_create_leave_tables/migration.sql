-- Migration: create_leave_tables
-- Phase 07 — Leave / Time-Off Management.
--
-- leave_requests attaches to employee_profiles, matching Phase 06's attendance_records
-- precedent, not users. days_used/days_pending are deliberately NOT stored anywhere — they are
-- derived by aggregating leave_requests at read time (see leavePolicy.js) so there is exactly
-- one source of truth for balance figures.

CREATE TYPE "LeaveType" AS ENUM ('paid_time_off', 'sick_leave', 'unpaid_leave');
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_profile_id" UUID NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    -- DECIMAL(6,2), not (4,2): unpaid_leave is explicitly unbounded (no balance row, no ceiling —
    -- see leavePolicy.js), so a long unpaid-leave request (e.g. a multi-month sabbatical) must
    -- not silently overflow a 2-digit-integer-part column. Decimal (not integer) leaves room for
    -- half-days per the same schema note as attendance's work_hours/extra_hours.
    "days_count" DECIMAL(6,2) NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "remarks" TEXT,
    "attachment_url" VARCHAR(255),
    "admin_comment" TEXT,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_requests_date_range_check" CHECK ("end_date" >= "start_date")
);

-- CreateIndex (the overlap check filters on employee + range; the calendar view filters on
-- employee + year via start_date)
CREATE INDEX "leave_requests_employee_profile_id_start_date_idx" ON "leave_requests"("employee_profile_id", "start_date");

-- CreateIndex (the Admin table filters on status)
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- Concurrency defense for overlapping leave requests, mirroring Phase 06's unique constraint on
-- attendance_records: two simultaneous submissions with overlapping ranges for the same
-- employee must not both succeed. The application-level overlap check
-- (leavePolicy.js rangesOverlap + service.js) is a good-UX pre-check, not the real defense —
-- this exclusion constraint is (see the concurrency test in tests/integration). Scoped to
-- PENDING/APPROVED only via the WHERE clause, matching the same "REJECTED doesn't block" rule
-- the application-level check applies.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_no_overlap"
  EXCLUDE USING gist (
    "employee_profile_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("status" IN ('pending', 'approved'));

-- AddForeignKey
-- ON DELETE CASCADE, matching Phase 06's attendance_records precedent — a leave request is
-- meaningless without its employee, same reasoning as attendance_records diverging from the
-- SET NULL convention used for *optional* FKs elsewhere in this schema.
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Nullable + SET NULL: who decided a request is audit context (recorded because a decision with
-- no recorded actor is not auditable — [RECOMMENDATION], neither source names this field), not a
-- required relationship — the request must survive the deciding admin's account being removed.
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "employee_profile_id" UUID NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "days_allocated" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_profile_id_leave_type_key" ON "leave_balances"("employee_profile_id", "leave_type");

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- [RECOMMENDATION pending D-11] organization_id nullable: NULL = global/default holiday set.
-- This shape supports both outcomes (per-company vs. global) without a later schema change —
-- see leavePolicy.js.
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "holiday_date" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (the ?year= query filters on this)
CREATE INDEX "public_holidays_holiday_date_idx" ON "public_holidays"("holiday_date");

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
