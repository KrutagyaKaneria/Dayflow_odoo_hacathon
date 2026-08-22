# Dayflow HRMS

Express.js + PostgreSQL backend and React frontend for the Dayflow HRMS project.
**Current status: Phase 01 complete — foundational data model & environment only.**
No authentication, business logic, or UI screens exist yet by design (see the phase
roadmap).

## Stack

| Layer     | Tech                          |
| --------- | ----------------------------- |
| Backend   | Node.js 20+, Express          |
| Database  | PostgreSQL 16                 |
| ORM       | Prisma (Prisma Migrate)       |
| Testing   | Jest (backend), smoke script (frontend) |
| Frontend  | React + Vite                  |

## Repository layout

```
/backend
  /src
    /config        # env loading (fails loudly), DB client
    /db
      /migrations  # Prisma migrations (one table each, with down.sql)
      /seeds       # dev-seed.js (one organization only, for now)
    /modules       # empty placeholder — auth/, employees/, ... arrive in later phases
    /shared        # response/error envelope conventions (see shared/README.md)
    app.js         # Express app factory (GET /health is the only endpoint in Phase 01)
    server.js      # entrypoint
  /tests           # Jest: migrations up/down, constraints, health check
  .env.example
/frontend
  /src/app         # scaffold shell ("under construction" page) — no routes yet
  scripts/smoke.mjs
docker-compose.yml # local Postgres (dayflow_dev + dayflow_test databases)
```

## Prerequisites

- Node.js >= 20
- Docker (for the local Postgres) — or any reachable PostgreSQL 16 instance

## Setup

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Configure environment (backend/.env is gitignored — never commit it)
cp backend/.env.example backend/.env
# Edit values if you do not use the docker-compose defaults below.

# 3. Start local Postgres (creates dayflow_dev on first boot)
docker compose up -d

# 4. Run migrations against the dev database
cd backend && npm run migrate:deploy

# 5. Seed dev data (currently: one organization; users stay empty until Phase 02+)
npm run db:seed
```

The `dayflow_test` database is created and migrated automatically the first time you
run the backend tests (`scripts/create-test-db.js` handles both).

## Running

```bash
# Backend — http://localhost:4000 (health: GET /health -> {"status":"ok","db":"connected"})
cd backend && npm run dev

# Frontend — http://localhost:5173 (no port conflict with the backend)
cd frontend && npm run dev
```

## Migrations

Prisma Migrate is the source of truth (`backend/src/db/schema.prisma`):

```bash
cd backend
npx prisma migrate dev --name <descriptive_name>   # create a new migration during development
npm run migrate:deploy                             # apply pending migrations
npm run migrate:down [-- --count N]                # revert via down.sql scripts (dev/test convenience)
```

Notes:

- Each Phase 01 migration folder contains `migration.sql` (up) **and** `down.sql`
  (reversal). Prisma has no native down command; `npm run migrate:down` applies
  `down.sql` files newest-first. Never point it at data you care about.
- Never edit an applied migration; add a new one instead.
- Do not seed from migrations. Seeding is separate (`src/db/seeds/`).

## Testing

```bash
# Backend: creates/migrates dayflow_test, then runs all suites
cd backend && npm test

# Frontend scaffold smoke test (builds the app and checks the mount point)
cd frontend && npm test
```

Backend suites:

1. `tests/integration/01-migrations.test.js` — full up → down → up cycle on an
   isolated scratch database (`dayflow_migration_test`).
2. `tests/integration/02-constraints.test.js` — email/login_id/profile uniqueness,
   multi-NULL login_ids allowed, FK ON DELETE behavior.
3. `tests/integration/03-health.test.js` — `/health` 200 path + 503 error envelope
   when the DB is unreachable.

## Open decisions carried into later phases

The schema was shaped to keep both outcomes possible; see the `TODO(D-xx)` comments
in `backend/src/db/schema.prisma` and the migration SQL files:

- **D-01 — registration model** (self-service vs. admin-provisioned): decides whether
  `users.login_id`, `users.created_by_user_id`, and possibly `organizations` become
  required or vestigial. Resolves in Phase 02.
- **D-21 — employee-editable field set**: Phase 04 concern; Phase 01 ships core
  identity fields of `employee_profiles` only.
