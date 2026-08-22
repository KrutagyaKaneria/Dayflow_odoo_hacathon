-- Migration: create_employee_profiles
-- Phase 01 foundational schema. Table 3 of 3 (depends on: organizations, users).
-- Core identity fields ONLY — profile detail sections (Resume/Private Info/Bank Details/Salary/
-- Documents) belong to Phases 4 and 8 and are deliberately absent.

CREATE TABLE "employee_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "department" VARCHAR(255),
    "manager_id" UUID,
    "location" VARCHAR(255),
    "date_of_joining" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (one-to-one with User/Account)
CREATE UNIQUE INDEX "employee_profiles_user_id_key" ON "employee_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TODO(confirm delete behavior before Phase 3+): user -> profile is ON DELETE RESTRICT so a User's
-- Employee Profile is never cascade-deleted implicitly; revisit once account-deletion semantics are
-- decided in a later phase.

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (self-referencing manager chain)
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TODO(D-21): the exact employee-editable field set (PDF's narrow address/phone/picture vs. the
-- design's broader-looking editable icons) is a Phase 4 concern, not a Phase 1 schema concern —
-- no action needed here; the core-fields-only list above must not be mistaken for a statement on
-- editability.
