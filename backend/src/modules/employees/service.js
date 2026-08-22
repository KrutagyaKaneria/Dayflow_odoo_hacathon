const { prisma } = require('../../config/db');
const { EmployeeError } = require('./errors');

// [RECOMMENDATION] Neither source document specifies a page size for the directory listing.
const DEFAULT_PAGE_SIZE = 20;

// Phase 05 — GET /employees. Deliberately minimal, safe-to-expose-broadly projection: see the
// [RECOMMENDATION pending D-14] note in routes.js. Returns { id, name, avatarUrl, statusIcon }
// per employee, never Private Info / Bank Details / anything Phase 04 guards.
async function listEmployees({ search, page = 1 } = {}) {
  const pageNum = Number.isInteger(page) && page > 0 ? page : 1;
  const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};

  const [rows, total] = await Promise.all([
    prisma.employeeProfile.findMany({
      where,
      select: { userId: true, name: true, avatarUrl: true },
      orderBy: { name: 'asc' },
      skip: (pageNum - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
    prisma.employeeProfile.count({ where }),
  ]);

  return {
    employees: rows.map((row) => ({
      id: row.userId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      // [STUB — Phase 09 replaces this] statusIcon is hardcoded to 'unknown' (render as a
      // neutral gray dot) for every employee this phase, since no Attendance or Leave data
      // exists yet to derive it from. Do NOT implement any real present/absent/leave derivation
      // here — that belongs to Phase 09's Cross-Module Integration, which explicitly owns this
      // calculation.
      statusIcon: 'unknown',
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
  return profile;
}

async function updateOwnProfile(userId, fields) {
  await getProfileByUserId(userId); // 404s before attempting the write if no profile exists
  return prisma.employeeProfile.update({
    where: { userId },
    data: fields,
    include: { bankDetails: true },
  });
}

async function adminUpdateProfile(userId, profileFields, bankFields) {
  const existing = await getProfileByUserId(userId);
  return prisma.$transaction(async (tx) => {
    const profile = await tx.employeeProfile.update({ where: { userId }, data: profileFields });
    let bankDetails = existing.bankDetails;
    if (bankFields) {
      bankDetails = await tx.employeeBankDetails.upsert({
        where: { employeeProfileId: existing.id },
        create: { employeeProfileId: existing.id, ...bankFields },
        update: bankFields,
      });
    }
    return { ...profile, bankDetails };
  });
}

module.exports = { listEmployees, getProfileByUserId, updateOwnProfile, adminUpdateProfile };
