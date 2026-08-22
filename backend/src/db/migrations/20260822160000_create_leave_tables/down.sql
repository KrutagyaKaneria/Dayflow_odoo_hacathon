-- Reversibility script (Prisma Migrate has no native down; apply via `npm run migrate:down`).
DROP TABLE IF EXISTS "public_holidays";
DROP TABLE IF EXISTS "leave_balances";
DROP TABLE IF EXISTS "leave_requests";
DROP TYPE IF EXISTS "LeaveStatus";
DROP TYPE IF EXISTS "LeaveType";
