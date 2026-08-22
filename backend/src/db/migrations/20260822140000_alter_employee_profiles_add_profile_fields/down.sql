-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
ALTER TABLE "employee_profiles"
  DROP COLUMN "avatar_url",
  DROP COLUMN "about",
  DROP COLUMN "job_likes",
  DROP COLUMN "skills",
  DROP COLUMN "phone",
  DROP COLUMN "date_of_birth",
  DROP COLUMN "residing_address",
  DROP COLUMN "nationality",
  DROP COLUMN "personal_email",
  DROP COLUMN "gender",
  DROP COLUMN "marital_status";
