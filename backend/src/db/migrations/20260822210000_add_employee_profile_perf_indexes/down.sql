-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
DROP INDEX IF EXISTS "employee_profiles_organization_id_date_of_joining_idx";
DROP INDEX IF EXISTS "employee_profiles_name_idx";
