-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
-- Cannot safely restore NOT NULL without first deleting any NULL check_in_at rows this phase
-- wrote — that data loss is the correct price of reverting a phase that changed the meaning of
-- the column, not something to hide.
DELETE FROM "attendance_records" WHERE "check_in_at" IS NULL;
ALTER TABLE "attendance_records" ALTER COLUMN "check_in_at" SET NOT NULL;
