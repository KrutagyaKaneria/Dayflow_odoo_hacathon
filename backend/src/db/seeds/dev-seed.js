/**
 * Dev seed — grows incrementally per phase (Master Roadmap §4.4 test-data strategy).
 *
 * Phase 01: inserts ONE organization and leaves users/employee_profiles empty — a realistic
 * seeded user needs login-ID generation + password hashing + profile fields that only exist
 * from Phase 02/04 onward. Fabricating fake hashes or login IDs here would bake throwaway data
 * conventions into the project.
 *
 * Phase 07: seeds the nine India-specific public holidays the design lists (organization_id
 * NULL — a global set, per D-11) for 2026, and backfills default leave_balances rows
 * (paid_time_off/sick_leave, per leavePolicy.js DEFAULT_ALLOCATIONS) for whatever
 * employee_profiles already exist when this runs. Since this script creates zero profiles
 * itself, that backfill is a convenience for exploring the dev DB, not the actual correctness
 * mechanism — service.js's resolveAllocatedDays() falls back to the same DEFAULT_ALLOCATIONS
 * live, at read time, for any employee (including ones provisioned after this script last ran)
 * with no leave_balances row yet. Re-running this script is safe (idempotent) either way.
 *
 * Phase 08: backfills the design's worked-example salary structure (wage 50000, the 8-component
 * set that reproduces the design's figures exactly — see calculateSalary.test.js) for whatever
 * employee_profiles already exist AND DON'T ALREADY HAVE a structure. Unlike leave balances,
 * this is NOT skipped-and-refallen-back-to-live for a missing row — payroll has no equivalent
 * "default allocation" concept, so an employee genuinely has no salary structure until an Admin
 * (or this seed) creates one; GET /payroll/me correctly 404s NO_SALARY_STRUCTURE until then. This
 * seed step only ever CREATES for an employee with no structure yet — it never overwrites one an
 * Admin has already edited via PATCH /payroll/:employeeId, respecting the D-22 overwrite-only-
 * via-explicit-PATCH default.
 *
 * Usage: npm run db:seed   (targets DATABASE_URL)
 */
const { prisma } = require('../../config/db');
const { DEFAULT_ALLOCATIONS } = require('../../modules/leave/leavePolicy');

const DEV_ORGANIZATION = {
  name: 'Dayflow Dev Company',
};

// [DESIGN] The nine India-specific dates the calendar lists, for 2026 (the year the design's
// calendar shows). Global set (organizationId: null) — see D-11 in leavePolicy.js.
const PUBLIC_HOLIDAYS_2026 = [
  { date: '2026-01-14', name: 'Kite Festival' },
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Dhuleti' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-08-28', name: 'Rakhi' },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-11-08', name: 'Diwali' },
  { date: '2026-11-10', name: 'New Year' },
  { date: '2026-11-11', name: 'Bhai Duj' },
];

async function seedOrganization() {
  const existing = await prisma.organization.findFirst({ where: { name: DEV_ORGANIZATION.name } });
  if (!existing) {
    await prisma.organization.create({ data: DEV_ORGANIZATION });
  }
}

async function seedPublicHolidays() {
  for (const holiday of PUBLIC_HOLIDAYS_2026) {
    const holidayDate = new Date(`${holiday.date}T00:00:00.000Z`);
    const existing = await prisma.publicHoliday.findFirst({
      where: { organizationId: null, holidayDate, name: holiday.name },
    });
    if (!existing) {
      await prisma.publicHoliday.create({
        data: { organizationId: null, holidayDate, name: holiday.name },
      });
    }
  }
}

async function backfillLeaveBalances() {
  const profiles = await prisma.employeeProfile.findMany({ select: { id: true } });
  for (const profile of profiles) {
    for (const [leaveType, daysAllocated] of Object.entries(DEFAULT_ALLOCATIONS)) {
      await prisma.leaveBalance.upsert({
        where: { employeeProfileId_leaveType: { employeeProfileId: profile.id, leaveType } },
        create: { employeeProfileId: profile.id, leaveType, daysAllocated },
        update: {},
      });
    }
  }
}

// [DESIGN] The worked-example component set. Basic -> percentage-of-wage (isBasic: true);
// everything else -> percentage-of-basic, per D-35 — see payrollPolicy.js and
// calculateSalary.test.js for the full reasoning and the reproduced figures.
const DESIGN_SALARY_COMPONENTS = [
  { name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 50, description: '50% of Wage', displayOrder: 1 },
  { name: 'House Rent Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, description: '50% of Basic', displayOrder: 2 },
  { name: 'Standard Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 16.67, description: '16.67% of Basic', displayOrder: 3 },
  { name: 'Performance Bonus', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 8.33, description: '8.33% of Basic', displayOrder: 4 },
  // Value not dictated by either source's worked example (only named as a component to model) —
  // chosen to keep the seeded fixture safely under the wage ceiling (D-34).
  { name: 'Leave Travel Allowance', componentKind: 'earning', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 1250, description: 'Fixed allowance', displayOrder: 5 },
  { name: 'PF (Employee)', componentKind: 'deduction_employee', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: '12% of Basic, deducted from pay', displayOrder: 6 },
  { name: 'PF (Employer)', componentKind: 'contribution_employer', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: '12% of Basic, employer cost only', displayOrder: 7 },
  { name: 'Professional Tax', componentKind: 'deduction_employee', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 200, description: 'Deducted from Gross salary', displayOrder: 8 },
];

async function backfillSalaryStructures() {
  const profiles = await prisma.employeeProfile.findMany({
    select: { id: true, salaryStructure: { select: { id: true } } },
  });
  for (const profile of profiles) {
    if (profile.salaryStructure) continue; // never overwrite an existing (possibly Admin-edited) structure
    await prisma.salaryStructure.create({
      data: {
        employeeProfileId: profile.id,
        wageType: 'fixed',
        monthlyWage: 50000,
        yearlyWage: 600000,
        workingDaysPerWeek: 5, // created here, consumed by nothing this phase — see payrollPolicy.js
        breakTimeHours: 1,
        components: { create: DESIGN_SALARY_COMPONENTS },
      },
    });
  }
}

async function main() {
  await seedOrganization();
  await seedPublicHolidays();
  await backfillLeaveBalances();
  await backfillSalaryStructures();

  const [orgs, users, profiles, holidays, balances, structures] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.employeeProfile.count(),
    prisma.publicHoliday.count(),
    prisma.leaveBalance.count(),
    prisma.salaryStructure.count(),
  ]);

  console.log(
    `[dayflow] seed complete — organizations: ${orgs}, users: ${users}, employee_profiles: ${profiles}, public_holidays: ${holidays}, leave_balances: ${balances}, salary_structures: ${structures}`
  );
}

main()
  .catch((err) => {
    console.error(`[dayflow] seed failed: ${err.message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
