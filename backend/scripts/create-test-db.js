/**
 * Test-database setup:
 *   1. ensures the database named in DATABASE_URL_TEST exists (created empty if missing),
 *   2. applies Prisma migrations to it.
 *
 * Migrations must target DATABASE_URL_TEST explicitly (Prisma otherwise reads
 * DATABASE_URL from .env, which points at the dev database).
 */
const { execFileSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

function parseUrl(url) {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
  };
}

async function main() {
  const target = process.env.DATABASE_URL_TEST;
  if (!target) throw new Error('DATABASE_URL_TEST is not set.');

  const cfg = parseUrl(target);
  // Connect to the maintenance DB to create the target DB.
  const adminUrl = new URL(target);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [cfg.database]
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${cfg.database}"`);
      console.log(`[dayflow] created test database ${cfg.database}`);
    } else {
      console.log(`[dayflow] test database ${cfg.database} already exists`);
    }
  } finally {
    await client.end();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: target },
    stdio: 'inherit',
  });
}

main().catch((err) => {
  console.error(`[dayflow] create-test-db failed: ${err.message}`);
  process.exit(1);
});
