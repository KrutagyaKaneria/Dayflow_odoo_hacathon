-- Migration: create_users
-- Phase 01 foundational schema. Table 2 of 3 (depends on: organizations).

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('employee', 'admin_hr');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "login_id" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "role" "Role" NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex (login_id)
-- Uniqueness is enforced when non-null. Multiple NULL values are allowed: PostgreSQL's default
-- unique index treats NULLs as distinct (we deliberately do NOT use PG15+ `NULLS NOT DISTINCT`,
-- nor a partial index, because Prisma's schema-level @unique maps to this plain unique index and
-- the default behavior is exactly the required partial-unique semantics). A constraint test in
-- tests/integration locks this behavior in.
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (self-referencing)
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TODO(D-01): registration model (self-service per PDF §3.1.1 vs. admin-provisioned per design
-- Note) is unresolved. This schema supports either:
--   - If self-service wins: login_id/created_by_user_id stay null and organization_id may go unused.
--   - If admin-provisioned wins: login_id and created_by_user_id become required at the application
--     layer in Phase 02.
-- Do NOT add a NOT NULL constraint to login_id or created_by_user_id until that decision is recorded
-- in the Decision Register.
