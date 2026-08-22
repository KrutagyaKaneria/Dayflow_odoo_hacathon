/**
 * Constraint tests — Phase 01.
 *
 * Runs against dayflow_test (migrated via `npm run db:test:setup`):
 *   - users.email uniqueness
 *   - users.login_id uniqueness when non-null, multiple NULLs allowed
 *   - employee_profiles.user_id uniqueness (one profile per user)
 *   - FK delete behavior on organization_id / manager_id / created_by_user_id
 *     (ON DELETE SET NULL) and user -> profile RESTRICT
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

async function createUser(overrides = {}) {
  // role has no DB default by design (spec: NOT NULL, unset default) — tests state it.
  return prisma.user.create({
    data: { email: `user-${uniqueSuffix()}@example.com`, role: 'employee', ...overrides },
  });
}

async function createProfile(userId, overrides = {}) {
  return prisma.employeeProfile.create({
    data: { userId, name: 'Test Employee', ...overrides },
  });
}

beforeEach(async () => {
  // Child tables first (FK order); raw TRUNCATE CASCADE is simpler and safe here.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "employee_profiles", "users", "organizations" CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('users.email uniqueness', () => {
  test('rejects a duplicate email', async () => {
    const email = `dup-${uniqueSuffix()}@example.com`;
    await createUser({ email });
    await expect(createUser({ email })).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('users.login_id partial-unique behavior', () => {
  test('allows multiple NULL login_ids', async () => {
    await createUser(); // login_id null
    await createUser(); // login_id null again — must succeed
    const nullCount = await prisma.user.count({ where: { loginId: null } });
    expect(nullCount).toBeGreaterThanOrEqual(2);
  });

  test('rejects a duplicate non-null login_id', async () => {
    const loginId = `EMP-${uniqueSuffix()}`;
    await createUser({ loginId });
    await expect(createUser({ loginId })).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('employee_profiles one-to-one with users', () => {
  test('rejects a second profile for the same user', async () => {
    const user = await createUser();
    await createProfile(user.id);
    await expect(createProfile(user.id)).rejects.toMatchObject({ code: 'P2002' });
  });

  test('deleting a user that still has a profile is restricted', async () => {
    const user = await createUser();
    await createProfile(user.id);
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();

    // TODO(confirm delete behavior before Phase 3+): profile is never
    // cascade-deleted implicitly; account-deletion semantics are a later-phase decision.
  });
});

describe('optional FKs use ON DELETE SET NULL', () => {
  test('deleting an organization nulls users.organization_id and profiles.organization_id', async () => {
    const org = await prisma.organization.create({ data: { name: 'Acme' } });
    const user = await createUser({ organizationId: org.id });
    await createProfile(user.id, { organizationId: org.id });

    await prisma.organization.delete({ where: { id: org.id } });

    const refreshedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshedUser.organizationId).toBeNull();
    const profile = await prisma.employeeProfile.findUnique({
      where: { userId: user.id },
    });
    expect(profile.organizationId).toBeNull();
  });

  test('deleting a manager profile nulls reports.manager_id', async () => {
    const managerUser = await createUser();
    const manager = await createProfile(managerUser.id, { name: 'Manager' });
    const reportUser = await createUser();
    const report = await createProfile(reportUser.id, {
      name: 'Report',
      managerId: manager.id,
    });

    await prisma.employeeProfile.delete({ where: { id: manager.id } });

    const refreshed = await prisma.employeeProfile.findUnique({
      where: { id: report.id },
    });
    expect(refreshed.managerId).toBeNull();
  });

  test('deleting a creator user nulls created_by_user_id on provisioned accounts', async () => {
    const admin = await createUser();
    const provisioned = await createUser({ createdByUserId: admin.id });

    await prisma.user.delete({ where: { id: admin.id } });

    const refreshed = await prisma.user.findUnique({ where: { id: provisioned.id } });
    expect(refreshed.createdByUserId).toBeNull();
  });
});
