-- Migration: alter_employee_profiles_add_profile_fields
-- Phase 04 — Employee Profile Management (Core). Adds Resume + Private Info tab fields to
-- employee_profiles. Salary Info fields (Phase 08) and Documents (D-13, not built) remain
-- deliberately absent — see schema.prisma comments.

ALTER TABLE "employee_profiles"
  ADD COLUMN "avatar_url" VARCHAR(255),
  ADD COLUMN "about" TEXT,
  ADD COLUMN "job_likes" TEXT,
  ADD COLUMN "skills" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "phone" VARCHAR(50),
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "residing_address" TEXT,
  ADD COLUMN "nationality" VARCHAR(255),
  ADD COLUMN "personal_email" VARCHAR(255),
  ADD COLUMN "gender" VARCHAR(50),
  ADD COLUMN "marital_status" VARCHAR(50);
