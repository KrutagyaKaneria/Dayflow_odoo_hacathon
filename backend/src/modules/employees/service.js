const { prisma } = require('../../config/db');
const { EmployeeError } = require('./errors');
const { batchDeriveStatusIcons } = require('../integration/deriveEmployeeStatus');
const { encryptField, decryptField } = require('../../shared/security/fieldEncryption');
const { recordAuditEvent } = require('../../shared/audit/auditLog');

// Phase 10 — Security Hardening, item 4. account_number and pan_no were flagged in Phase 04 as
// `[RECOMMENDATION pending Phase 10 hardening]`, plaintext-with-DB-access-controls-only.
// uan_no is included too (also a government ID number). bank_name/ifsc_code/emp_code are left
// plaintext — they identify a bank/branch/employee code, not a person's financial identity, so
// encrypting them adds ciphertext-comparison friction (e.g. no longer indexable/searchable) with
// no proportionate confidentiality benefit.
const ENCRYPTED_BANK_FIELDS = ['accountNumber', 'panNo', 'uanNo'];

function encryptBankFields(fields) {
  const result = { ...fields };
  for (const field of ENCRYPTED_BANK_FIELDS) {
    if (field in result) {
      result[field] = encryptField(result[field]);
    }
  }
  return result;
}

function decryptBankDetails(bankDetails) {
  if (!bankDetails) return bankDetails;
  const result = { ...bankDetails };
  for (const field of ENCRYPTED_BANK_FIELDS) {
    if (result[field] != null) {
      result[field] = decryptField(result[field]);
    }
  }
  return result;
}

// Every function that returns a profile to a caller (route handler) routes through this, so
// decryption happens in exactly one place — never inline at each call site, and never at the
// routes.js/response-formatting layer, which stays unaware that encryption exists at all.
function withDecryptedBankDetails(profile) {
  if (!profile) return profile;
  return { ...profile, bankDetails: decryptBankDetails(profile.bankDetails) };
}

// [RECOMMENDATION] Neither source document specifies a page size for the directory listing.
const DEFAULT_PAGE_SIZE = 20;

// Phase 05 — GET /employees. Deliberately minimal, safe-to-expose-broadly projection: see the
// [RECOMMENDATION pending D-14] note in routes.js. Returns { id, name, avatarUrl, statusIcon }
// per employee, never Private Info / Bank Details / anything Phase 04 guards. The projection
// SHAPE is unchanged from Phase 05 — only statusIcon's value is now real (Phase 09, D-40 — see
// modules/integration/deriveEmployeeStatus.js).
async function listEmployees({ search, page = 1 } = {}) {
  const pageNum = Number.isInteger(page) && page > 0 ? page : 1;
  const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};

  const [rows, total] = await Promise.all([
    prisma.employeeProfile.findMany({
      where,
      select: { id: true, userId: true, name: true, avatarUrl: true },
      orderBy: { name: 'asc' },
      skip: (pageNum - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
    prisma.employeeProfile.count({ where }),
  ]);

  // Batched — two queries total for the whole page, not one per employee. See
  // deriveEmployeeStatus.js's batchDeriveStatusIcons docstring.
  const statusIcons = await batchDeriveStatusIcons(rows.map((row) => row.id));

  return {
    employees: rows.map((row) => ({
      id: row.userId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      statusIcon: statusIcons.get(row.id) ?? 'absent',
    })),
    page: pageNum,
    pageSize: DEFAULT_PAGE_SIZE,
    total,
  };
}

async function getProfileByUserId(userId) {
  const profile = await prisma.employeeProfile.findUnique({
    where: { userId },
    include: { bankDetails: true },
  });
  if (!profile) {
    // Path B (self-service signup, Phase 02) creates a users row with no employee_profile —
    // Phase 02 never built profile creation for that path. Surfacing this as 404 rather than a
    // crash; resolving it properly is bound up with D-01 (which signup path wins), not this
    // phase.
    throw new EmployeeError(404, 'PROFILE_NOT_FOUND', 'No employee profile exists for this account.');
  }
  return withDecryptedBankDetails(profile);
}

async function updateOwnProfile(userId, fields) {
  await getProfileByUserId(userId); // 404s before attempting the write if no profile exists
  const profile = await prisma.employeeProfile.update({
    where: { userId },
    data: fields,
    include: { bankDetails: true },
  });
  return withDecryptedBankDetails(profile);
}

async function adminUpdateProfile(userId, profileFields, bankFields, actorUserId) {
  // getProfileByUserId already decrypts — `existing.bankDetails` below is safe to use as a
  // plaintext fallback (never re-persisted, only returned) when bankFields wasn't sent.
  const existing = await getProfileByUserId(userId);
  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.employeeProfile.update({ where: { userId }, data: profileFields });
    let bankDetails = existing.bankDetails;
    if (bankFields) {
      const encryptedBankFields = encryptBankFields(bankFields);
      bankDetails = await tx.employeeBankDetails.upsert({
        where: { employeeProfileId: existing.id },
        create: { employeeProfileId: existing.id, ...encryptedBankFields },
        update: encryptedBankFields,
      });
      bankDetails = decryptBankDetails(bankDetails); // decrypt the just-written row for the response
    }

    // D-23 audit trail — admin profile edit. metadata records which FIELD NAMES changed, never
    // their values — profileFields can include Private Info (nationality, DOB, address) and
    // bankFields' values are exactly the raw account_number/pan_no/uan_no the audit log must
    // never carry, even though they're encrypted in the source table.
    await recordAuditEvent(tx, {
      actorUserId,
      action: 'employee_profile.admin_update',
      targetType: 'employee_profile',
      targetId: existing.id,
      metadata: {
        profileFieldsChanged: Object.keys(profileFields || {}),
        bankFieldsChanged: bankFields ? Object.keys(bankFields) : [],
      },
    });

    return { ...profile, bankDetails };
  });
  return result;
}

module.exports = { listEmployees, getProfileByUserId, updateOwnProfile, adminUpdateProfile };
