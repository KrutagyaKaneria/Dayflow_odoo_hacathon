/**
 * Migration tests — Phase 01.
 *
 * Runs against an isolated scratch database (dayflow_migration_test) so the
 * shared dayflow_test database used by other suites is untouched:
 *   1. fresh `prisma migrate deploy` applies all migrations in order (up),
 *   2. applying every down.sql reverts to an empty schema (down),
 *   3. a second deploy after the rollback succeeds (up again).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'src', 'db', 'migrations');
const SCRATCH_DB = 'dayflow_migration_test';

function scratchUrl() {
  const url = new URL(process.env.DATABASE_URL_TEST);
  url.pathname = `/${SCRATCH_DB}`;
  return url.toString();
}

async function withAdminClient(fn) {
  const adminUrl = new URL(process.env.DATABASE_URL_TEST);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function runMigrateDeploy(extraEnv = {}) {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: scratchUrl(), ...extraEnv },
    stdio: 'pipe',
  });
}

function applyAllDowns() {
  const client = new Client({ connectionString: scratchUrl() });
  const folders = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => fs.existsSync(path.join(MIGRATIONS_DIR, f, 'down.sql')))
    .sort()
    .reverse();

  return client.connect().then(() =>
    folders
      .reduce(
        (chain, folder) =>
          chain.then(() =>
            client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, folder, 'down.sql'), 'utf8'))
          ),
        Promise.resolve()
      )
      .finally(() => client.end())
  );
}

beforeAll(async () => {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${SCRATCH_DB}"`);
    await client.query(`CREATE DATABASE "${SCRATCH_DB}"`);
  });
});

afterAll(async () => {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${SCRATCH_DB}"`);
  });
});

test('migrations apply cleanly on a fresh database and create all tables (Phase 01 + Phase 02 + Phase 04 + Phase 06 + Phase 07)', () => {
  runMigrateDeploy();

  const client = new Client({ connectionString: scratchUrl() });
  return client.connect().then(() =>
    client
      .query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`
      )
      .then((res) => {
        expect(res.rows.map((r) => r.table_name)).toEqual([
          '_prisma_migrations',
          'attendance_records',
          'email_verification_tokens',
          'employee_bank_details',
          'employee_profiles',
          'leave_balances',
          'leave_requests',
          'organizations',
          'public_holidays',
          'refresh_tokens',
          'users',
        ]);
      })
      .finally(() => client.end())
  );
});

test('every migration is reversible via its down.sql (schema returns to empty)', async () => {
  await applyAllDowns();

  const client = new Client({ connectionString: scratchUrl() });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name NOT LIKE '\\_%' ESCAPE '\\'`
    );
    expect(res.rows).toHaveLength(0);

    // Enum type introduced by the users migration must be gone too.
    const enumRes = await client.query(
      "SELECT 1 FROM pg_type WHERE typname = 'Role'"
    );
    expect(enumRes.rowCount).toBe(0);
  } finally {
    await client.end();
  }
});

test('migrations re-apply cleanly after a full down (idempotent lifecycle)', () => {
  runMigrateDeploy();
});
