-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
DROP TABLE IF EXISTS "salary_components";
DROP TABLE IF EXISTS "salary_structures";
DROP TYPE IF EXISTS "SalaryPercentageBase";
DROP TYPE IF EXISTS "SalaryComputationType";
DROP TYPE IF EXISTS "SalaryComponentKind";
DROP TYPE IF EXISTS "SalaryWageType";
