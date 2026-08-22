/**
 * Shared fixtures for Phase 02 auth integration tests. Not itself a test file
 * (jest.config.cjs testMatch is `**\/*.test.js`).
 */
const { prisma } = require('../../../src/config/db');
const { hashPassword } = require('../../../src/modules/auth/password');

const DEFAULT_PASSWORD = 'Passw0rd!';

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

async function createOrganization(overrides = {}) {
  return prisma.organization.create({ data: { name: 'Odoo India', ...overrides } });
}

// Creates a user row with a known plaintext password (hashed before storage) so a test can
// exercise POST /auth/signin against it. email_verified_at defaults to "now" so sign-in isn't
// blocked by the D-17 default unless a test explicitly overrides it (e.g. Path B coverage).
async function createSignedInUser({ password = DEFAULT_PASSWORD, emailVerifiedAt = new Date(), ...overrides } = {}) {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: `user-${uniqueSuffix()}@example.com`,
      role: 'employee',
      passwordHash,
      emailVerifiedAt,
      ...overrides,
    },
  });
  return { user, password };
}

async function truncateAuthTables() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "refresh_tokens", "email_verification_tokens", "employee_profiles", "users", "organizations" CASCADE'
  );
}

module.exports = { uniqueSuffix, createOrganization, createSignedInUser, truncateAuthTables, DEFAULT_PASSWORD };
