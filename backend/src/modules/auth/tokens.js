const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { config } = require('../../config/db');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, organizationId: user.organizationId ?? null },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessTtl }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtAccessSecret);
}

// Opaque (non-JWT) tokens for refresh + email verification: generated with crypto.randomBytes,
// stored only as a hash (see refreshTokenStore.js / emailVerification.js) — the raw value exists
// only in the response that issued it.
function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateOpaqueToken, hashToken };
