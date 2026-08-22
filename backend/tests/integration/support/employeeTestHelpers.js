/**
 * Shared fixtures for Phase 04 employee-profile integration tests. Not itself a test file
 * (jest.config.cjs testMatch is `**\/*.test.js`).
 */
const { prisma } = require('../../../src/config/db');
const { hashPassword } = require('../../../src/modules/auth/password');
const { encryptField, decryptField } = require('../../../src/shared/security/fieldEncryption');

const DEFAULT_PASSWORD = 'Passw0rd!';
const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

// Phase 10: must match employees/service.js's ENCRYPTED_BANK_FIELDS exactly — a real
// employee_bank_details row is NEVER written with these three columns in plaintext (every
// production write path goes through the service layer's encryption), so a test fixture that
// bypasses the service layer (as this helper deliberately does, for speed) must still respect
// that invariant, or it would seed data shaped unlike anything the app itself ever produces.
const ENCRYPTED_BANK_FIELDS = ['accountNumber', 'panNo', 'uanNo'];

function encryptBankFieldsForSeed(bankDetails) {
  const result = { ...bankDetails };
  for (const field of ENCRYPTED_BANK_FIELDS) {
    if (field in result) result[field] = encryptField(result[field]);
  }
  return result;
}

function decryptBankFieldsForReturn(bankDetails) {
  if (!bankDetails) return bankDetails;
  const result = { ...bankDetails };
  for (const field of ENCRYPTED_BANK_FIELDS) {
    if (result[field] != null) result[field] = decryptField(result[field]);
  }
  return result;
}

// Creates a user + employee_profile pair directly (bypassing the provisioning HTTP endpoint,
// which is Phase 02's concern) so tests can focus on profile view/edit behavior. Pass
// `bankDetails` to also seed a one-to-one employee_bank_details row — the returned
// `profile.bankDetails` is plaintext (decrypted back for test-fixture readability); the row
// actually written to the database is encrypted, matching real writes.
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
      ...(bankDetails ? { bankDetails: { create: encryptBankFieldsForSeed(bankDetails) } } : {}),
    },
    include: { bankDetails: true },
  });
  return { user, profile: { ...profile, bankDetails: decryptBankFieldsForReturn(profile.bankDetails) }, password };
}

module.exports = { uniqueSuffix, createEmployeeWithProfile, DEFAULT_PASSWORD };
