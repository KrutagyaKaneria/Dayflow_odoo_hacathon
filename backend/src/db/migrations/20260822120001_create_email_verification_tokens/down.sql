-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
DROP TABLE IF EXISTS "email_verification_tokens";
