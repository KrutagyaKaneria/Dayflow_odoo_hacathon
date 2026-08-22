-- Migration: create_payroll_tables
-- Phase 08 — Payroll / Salary Management.
--
-- One salary_structures row per employee (unique FK), matching the D-22 overwrite default — no
-- versioning, no history table. Computed amounts (what a "50%" component evaluates to in
-- rupees) are NOT stored anywhere in either table — they are derived at read time by
-- calculateSalary.js, the same derived-not-stored decision already taken for leave balances in
-- Phase 07 and for attendance work/extra hours in Phase 06.

CREATE TYPE "SalaryWageType" AS ENUM ('fixed');
CREATE TYPE "SalaryComponentKind" AS ENUM ('earning', 'deduction_employee', 'contribution_employer');
CREATE TYPE "SalaryComputationType" AS ENUM ('fixed_amount', 'percentage');
CREATE TYPE "SalaryPercentageBase" AS ENUM ('wage', 'basic');

CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL,
    "employee_profile_id" UUID NOT NULL,
    "wage_type" "SalaryWageType" NOT NULL DEFAULT 'fixed',
    "monthly_wage" DECIMAL(12,2) NOT NULL,
    "yearly_wage" DECIMAL(12,2) NOT NULL,
    "working_days_per_week" DECIMAL(3,1),
    "break_time_hours" DECIMAL(4,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (one structure per employee — the D-22 overwrite default, enforced at the DB level)
CREATE UNIQUE INDEX "salary_structures_employee_profile_id_key" ON "salary_structures"("employee_profile_id");

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PF (employee/employer) and Professional Tax are rows in this table (component_kind
-- distinguishes them), not bespoke columns — see the module README / routes.js comment. The
-- design draws them in separate visual sections; that's a frontend grouping-by-component_kind
-- concern, not a schema one.
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL,
    "salary_structure_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "component_kind" "SalaryComponentKind" NOT NULL,
    "computation_type" "SalaryComputationType" NOT NULL,
    "percentage_base" "SalaryPercentageBase",
    -- Identifies which SINGLE component is "Basic" — the amount that percentage_base = 'basic'
    -- components derive from. Not named by either source: the design's own note ("If HRA = 50%
    -- of Basic...") presupposes exactly one canonical Basic figure per structure, but nothing in
    -- the schema said which row that was until this flag. [INFERENCE], required for the two-pass
    -- engine (calculateSalary.js) to know what "basic" resolves to.
    "is_basic" BOOLEAN NOT NULL DEFAULT false,
    "value" DECIMAL(8,4) NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id"),
    -- percentage_base is required for a percentage component and forbidden for a fixed one —
    -- see payrollPolicy.js (D-35) for what "base" means and why it's per-component, not global.
    CONSTRAINT "salary_components_percentage_base_check" CHECK (
      ("computation_type" = 'percentage' AND "percentage_base" IS NOT NULL) OR
      ("computation_type" = 'fixed_amount' AND "percentage_base" IS NULL)
    )
);

-- CreateIndex (the calculation engine reads a structure's full component set in display order)
CREATE INDEX "salary_components_salary_structure_id_idx" ON "salary_components"("salary_structure_id");

-- CreateIndex: at most one component per structure may be flagged as Basic — a partial unique
-- index is the clean way to express "unique when true" in Postgres.
CREATE UNIQUE INDEX "salary_components_one_basic_per_structure" ON "salary_components"("salary_structure_id") WHERE "is_basic" = true;

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
