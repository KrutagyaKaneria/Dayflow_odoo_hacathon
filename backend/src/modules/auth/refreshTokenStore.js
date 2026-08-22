const { prisma, config } = require('../../config/db');
const { generateOpaqueToken, hashToken, signAccessToken } = require('./tokens');
const { AuthError } = require('./errors');

function refreshTokenExpiry() {
  return new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

async function issueRefreshToken(userId) {
  const raw = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt: refreshTokenExpiry() },
  });
  return raw;
}

// [RECOMMENDATION] Rotation-on-every-use per the Master Roadmap's Security Baseline §5.5 — not a
// stated requirement from either source document. The old token is revoked in the same transaction
// that issues the new one, so a stolen-and-replayed old token cannot be used after a legitimate
// rotation has already happened.
async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AuthError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
  }

  const newRaw = generateOpaqueToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: { userId: record.userId, tokenHash: hashToken(newRaw), expiresAt: refreshTokenExpiry() },
    }),
  ]);

  return { accessToken: signAccessToken(record.user), refreshToken: newRaw, user: record.user };
}

async function revokeRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = { issueRefreshToken, rotateRefreshToken, revokeRefreshToken };
