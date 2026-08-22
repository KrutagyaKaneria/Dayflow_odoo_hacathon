const { prisma } = require('../../config/db');
const { EmployeeError } = require('./errors');

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

module.exports = { getProfileByUserId, updateOwnProfile, adminUpdateProfile };
