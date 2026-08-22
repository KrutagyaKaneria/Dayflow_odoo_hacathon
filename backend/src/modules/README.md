# Modules

Business logic lives in one folder per domain module.

- `auth/` — Phase 02: sign up/sign in, login ID generation, password hashing,
  account provisioning.
- `employees/` — Phase 04: employee profile view/edit (own + Admin-any), field-level edit
  policy (D-21), avatar upload. Salary Info (Phase 08) and Documents (D-13, still open) are
  deliberately not here — see editPolicy.js and routes.js comments.

Planned folders per the master roadmap — do not create them until their phase begins:

- `attendance/` — Phase 06.
- `leave/` — Phase 07.
- `payroll/` — Phase 09.

Nothing else belongs here yet.
