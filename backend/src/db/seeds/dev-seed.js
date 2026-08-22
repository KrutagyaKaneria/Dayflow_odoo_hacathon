/**
 * Phase 01 dev seed — intentionally minimal.
 *
 * Inserts ONE organization and leaves users/employee_profiles empty: a realistic
 * seeded user needs login-ID generation + password hashing + profile fields that
 * only exist from Phase 02/04 onward. Fabricating fake hashes or login IDs here
 * would bake throwaway data conventions into the project. Seed data grows
 * incrementally per the Master Roadmap §4.4 test-data strategy.
 *
 * Usage: npm run db:seed   (targets DATABASE_URL)
 */
const { prisma } = require('../../config/db');

const DEV_ORGANIZATION = {
  name: 'Dayflow Dev Company',
};

async function main() {
  const existing = await prisma.organization.findFirst({
    where: { name: DEV_ORGANIZATION.name },
  });
  if (!existing) {
    await prisma.organization.create({ data: DEV_ORGANIZATION });
  }

  const [orgs, users, profiles] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.employeeProfile.count(),
  ]);

  console.log(
    `[dayflow] seed complete — organizations: ${orgs}, users: ${users}, employee_profiles: ${profiles}`
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
