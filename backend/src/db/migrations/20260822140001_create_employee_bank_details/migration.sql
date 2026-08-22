-- Migration: create_employee_bank_details
-- Phase 04. One-to-one with employee_profiles.
--
-- [RECOMMENDATION pending Phase 10 hardening]: account_number and pan_no are high-sensitivity
-- PII. This table stores them in plaintext with standard DB access controls, consistent with
-- everything else in the schema so far — no field-level encryption is being introduced ad hoc
-- in this phase. Flagged here so Phase 10's security pass explicitly revisits this table, not
-- because it's being solved now.

CREATE TABLE "employee_bank_details" (
    "id" UUID NOT NULL,
    "employee_profile_id" UUID NOT NULL,
    "account_number" VARCHAR(255),
    "bank_name" VARCHAR(255),
    "ifsc_code" VARCHAR(50),
    "pan_no" VARCHAR(50),
    "uan_no" VARCHAR(50),
    "emp_code" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_bank_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (one-to-one with EmployeeProfile)
CREATE UNIQUE INDEX "employee_bank_details_employee_profile_id_key" ON "employee_bank_details"("employee_profile_id");

-- AddForeignKey
ALTER TABLE "employee_bank_details" ADD CONSTRAINT "employee_bank_details_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
