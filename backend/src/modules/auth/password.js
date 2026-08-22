const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Cost factor lives here ONCE — never hardcode a bcrypt round count anywhere else.
const BCRYPT_SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

// Path A initial passwords: cryptographically random, never Math.random(). base64url keeps it
// copy/paste-safe over an API response with no character-escaping surprises.
function generateInitialPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

// [RECOMMENDATION pending D-16] Default policy — min 8 chars, at least one letter and one digit.
// Change this single constant/function when D-16 is resolved; do not scatter the rule across files.
function validatePasswordPolicy(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  if (!/[A-Za-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

module.exports = {
  BCRYPT_SALT_ROUNDS,
  hashPassword,
  verifyPassword,
  generateInitialPassword,
  validatePasswordPolicy,
};
