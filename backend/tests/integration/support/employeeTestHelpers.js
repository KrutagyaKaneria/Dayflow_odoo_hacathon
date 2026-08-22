/**
 * Shared fixtures for Phase 04 employee-profile integration tests. Not itself a test file
 * (jest.config.cjs testMatch is `**\/*.test.js`).
 */
const { prisma } = require('../../../src/config/db');
const { hashPassword } = require('../../../src/modules/auth/password');

const DEFAULT_PASSWORD = 'Passw0rd!';
const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

// Creates a user + employee_profile pair directly (bypassing the provisioning HTTP endpoint,
// which is Phase 02's concern) so tests can focus on profile view/edit behavior. Pass
// `bankDetails` to also seed a one-to-one employee_bank_details row.
async function createEmployeeWithProfile({
  role = 'employee',
  password = DEFAULT_PASSWORD,
  profileOverrides = {},
  bankDetails,
} = {}) {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: `emp-${uniqueSuffix()}@example.com`,
      role,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
  const profile = await prisma.employeeProfile.create({
    data: {
      userId: user.id,
      name: 'Test Employee',
      dateOfJoining: new Date('2023-01-01'),
      ...profileOverrides,
      ...(bankDetails ? { bankDetails: { create: bankDetails } } : {}),
    },
    include: { bankDetails: true },
  });
  return { user, profile, password };
}

module.exports = { uniqueSuffix, createEmployeeWithProfile, DEFAULT_PASSWORD };
