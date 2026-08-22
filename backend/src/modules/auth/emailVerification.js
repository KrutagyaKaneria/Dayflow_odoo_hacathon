const { prisma } = require('../../config/db');
const { generateOpaqueToken, hashToken } = require('./tokens');
const { AuthError } = require('./errors');

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h — Path B only, not env-configurable this phase.

// Path B only. No real email service is integrated this phase (see prompt's explicit prohibition
// on SendGrid/SES/etc.) — the raw token is generated, hashed, and stored per spec, but nothing
// sends it anywhere. The caller (service.signUp) currently returns it in the signup API response
// as a temporary testing affordance; that is not a delivery mechanism and must not be treated as one.
async function issueEmailVerificationToken(userId) {
  const raw = generateOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    },
  });
  return raw;
}

async function verifyEmail(rawToken) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AuthError(400, 'INVALID_TOKEN', 'Invalid or expired verification token.');
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
}

module.exports = { issueEmailVerificationToken, verifyEmail };
