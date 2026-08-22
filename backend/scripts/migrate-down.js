/**
 * Phase 01 reversibility runner.
 *
 * Prisma Migrate has no native "down" command, so every migration folder ships
 * a hand-written down.sql. This script applies them in REVERSE chronological
 * order against the database named in DATABASE_URL. It is a development/test
 * convenience — never point it at production data you care about.
 *
 * Usage: npm run migrate:down [-- --count N]   (default: all pending downs)
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

async function main() {
  const countArg = process.argv.indexOf('--count');
  const count = countArg !== -1 ? parseInt(process.argv[countArg + 1], 10) : Infinity;

  const folders = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => !f.startsWith('.'))
    .sort()
    .reverse();

  let applied = 0;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const folder of folders) {
      if (applied >= count) break;

      const downPath = path.join(MIGRATIONS_DIR, folder, 'down.sql');
      if (!fs.existsSync(downPath)) continue; // lock file etc. skipped by filter

      const sql = fs.readFileSync(downPath, 'utf8');
      await client.query(sql);
      applied++;
      console.log(`[dayflow] reverted migration ${folder}`);
    }
  } finally {
    await client.end();
  }

  console.log(`[dayflow] done — reverted ${applied} migration(s).`);
}

main().catch((err) => {
  console.error(`[dayflow] migrate-down failed: ${err.message}`);
  process.exit(1);
});
