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

async function main() {
  await seedOrganization();
  await seedPublicHolidays();
  await backfillLeaveBalances();

  const [orgs, users, profiles, holidays, balances] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.employeeProfile.count(),
    prisma.publicHoliday.count(),
    prisma.leaveBalance.count(),
  ]);

  console.log(
    `[dayflow] seed complete — organizations: ${orgs}, users: ${users}, employee_profiles: ${profiles}, public_holidays: ${holidays}, leave_balances: ${balances}`
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
