# Modules

Business logic lives in one folder per domain module.

- `auth/` — Phase 02: sign up/sign in, login ID generation, password hashing,
  account provisioning.
- `employees/` — Phase 04: employee profile view/edit (own + Admin-any), field-level edit
  policy (D-21), avatar upload. Salary Info (Phase 08) and Documents (D-13, still open) are
  deliberately not here — see editPolicy.js and routes.js comments.
- `attendance/` — Phase 06: check-in/check-out, own month-scoped history, Admin day-scoped
  listing. Every open-decision value (timezone, standard hours, half-day threshold) lives in
  attendancePolicy.js — see D-06/D-25/D-26/D-29. Leave (`LEAVE` status), absent-derivation, and
  admin manual correction (D-07) are deliberately not here.
- `leave/` — Phase 07: leave application, balances (derived, never stored), public holidays,
  Admin approve/reject + read-only Allocation tab. Every open-decision value (day-count
  arithmetic, balance enforcement, default allocations) lives in leavePolicy.js — see
  D-04/D-05/D-08/D-09/D-11/D-30/D-32/D-33. **Writes nothing to attendance_records** — the
  Leave→Attendance sync is Phase 09's.

Planned folders per the master roadmap — do not create them until their phase begins:

- `payroll/` — Phase 09.

Nothing else belongs here yet.
