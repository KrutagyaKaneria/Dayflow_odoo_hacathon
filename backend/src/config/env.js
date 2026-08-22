const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const VALID_ENVIRONMENTS = ['development', 'test', 'production'];

function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (!VALID_ENVIRONMENTS.includes(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV "${nodeEnv}". Expected one of: ${VALID_ENVIRONMENTS.join(', ')}.`
    );
  }

  // Fail loudly rather than silently defaulting to a hardcoded connection string.
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing required environment variable DATABASE_URL.');
  }
  if (!process.env.DATABASE_URL.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a valid postgresql:// connection string.');
  }

  // Phase 02 — authentication. ENABLE_SELF_SERVICE_SIGNUP (D-01, still open) is deliberately NOT
  // cached here: it's read live from process.env at request time (see modules/auth/service.js) so
  // integration tests can flip it per-test without reloading modules.
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error('Missing required environment variable JWT_ACCESS_SECRET.');
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: parseInt(process.env.PORT, 10) || 4000,
    databaseUrl: process.env.DATABASE_URL,
    databaseUrlTest: process.env.DATABASE_URL_TEST || null,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) || 7,
  };
}

module.exports = { loadConfig };
