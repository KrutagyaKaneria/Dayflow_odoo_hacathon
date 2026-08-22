-- Migration: create_organizations
-- Phase 01 foundational schema. Table 1 of 3 (no dependencies).

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logo_url" VARCHAR(255),
    "contact_name" VARCHAR(255),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- TODO(D-01): if the resolved signup model is pure self-service with no company concept, this
-- table may end up single-row-per-deployment or unused. Do not delete it speculatively; wait for
-- Phase 02's decision to be recorded in the Decision Register before altering.
