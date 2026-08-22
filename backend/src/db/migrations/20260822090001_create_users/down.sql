-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "Role";
