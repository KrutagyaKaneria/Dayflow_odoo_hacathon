-- Migration: create_attendance_records
-- Phase 06 — Attendance Management.
--
-- Status enum carries all four PDF §3.4.1 values from day one so no later migration alters the
-- type. This phase writes 'present' and 'half_day' only:
--   'leave'  — Phase 09 owns the Leave→Attendance sync. Defined here, written never.
--   'absent' — deliberate: writing it requires a working-day calendar (public holidays: Phase 07
--              / D-11; working-days-per-week: Phase 08) that doesn't exist yet. A date with no
--              row is simply absent from query results — see attendancePolicy.js.
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'half_day', 'leave');

CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "employee_profile_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "check_in_at" TIMESTAMPTZ(3) NOT NULL,
    "check_out_at" TIMESTAMPTZ(3),
    "work_hours" DECIMAL(5,2),
    "extra_hours" DECIMAL(5,2),
    "status" "AttendanceStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- [RECOMMENDATION pending D-25] One record per employee per calendar date, enforced at the DB
-- level (the real defense against a concurrent double check-in — see attendancePolicy.js and the
-- concurrency test in tests/integration). TODO(D-25): drop this constraint if multi-session-per-
-- day (e.g. lunch break out/in) is adopted later — that would also require reworking this table
-- to one-row-per-session, not just relaxing this constraint.
CREATE UNIQUE INDEX "attendance_records_employee_profile_id_attendance_date_key" ON "attendance_records"("employee_profile_id", "attendance_date");

-- CreateIndex (the Admin day-scoped query filters on this across all employees — the hottest
-- read path in this module)
CREATE INDEX "attendance_records_attendance_date_idx" ON "attendance_records"("attendance_date");

-- AddForeignKey
-- ON DELETE CASCADE, diverging from Phase 01's ON DELETE SET NULL convention for *optional* FKs.
-- This FK is NOT optional (employee_profile_id is NOT NULL) — an attendance record is meaningless
-- without its employee, so cascade is correct here, not an inconsistency with the earlier tables.
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
