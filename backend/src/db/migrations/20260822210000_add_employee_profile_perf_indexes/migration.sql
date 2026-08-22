-- Migration: add_employee_profile_perf_indexes
-- Phase 10 — Security Hardening, item 11 (performance indexes, hot paths only).
-- "name" backs ORDER BY name ASC on every directory-style listing (GET /employees, GET
-- /payroll, the Admin attendance list). "(organization_id, date_of_joining)" backs the
-- login-id serial-number count query, now run up to 10x per provisioning request under the
-- Phase 10 concurrency-race fix (auth/service.js's MAX_LOGIN_ID_ATTEMPTS retry loop).

CREATE INDEX "employee_profiles_name_idx" ON "employee_profiles"("name");
CREATE INDEX "employee_profiles_organization_id_date_of_joining_idx" ON "employee_profiles"("organization_id", "date_of_joining");
