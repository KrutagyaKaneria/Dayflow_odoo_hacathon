-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
-- Narrowing back to VARCHAR(50) is only safe if no row currently holds an encrypted (i.e. >50
-- character) value in these columns — this down migration does not truncate or validate data.
ALTER TABLE "employee_bank_details" ALTER COLUMN "pan_no" TYPE VARCHAR(50);
ALTER TABLE "employee_bank_details" ALTER COLUMN "uan_no" TYPE VARCHAR(50);
