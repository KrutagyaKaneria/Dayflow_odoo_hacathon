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
  D-04/D-05/D-08/D-09/D-11/D-30/D-32/D-33. Phase 09 extended `decide()` to sync approved leave
  to attendance inline (see `integration/`) — leave itself still never reads attendance or
  payroll data.
- `payroll/` — Phase 08: salary structure + component calculation engine (calculateSalary.js,
  pure, unit-tested against the design's worked example), own-view/Admin-edit split (D-03).
  Every open-decision value (percentage base, wage constraint scope, currency, versioning) lives
  in payrollPolicy.js — see D-03/D-22/D-34/D-35/D-36/D-37. Phase 09 added the payable-days
  endpoint here (delegating the actual calculation to `integration/`); `working_days_per_week`
  is now read by that calculation, still never edited or otherwise consumed by this module.
- `integration/` — Phase 09: the first and only module permitted to read across
  attendance/leave/payroll boundaries. Directory status-icon derivation (D-40, batched, two
  queries regardless of employee count), the Leave→Attendance sync run inline inside
  leave/service.js's approval transaction (D-39, D-33), and the payable-days calculation (D-38,
  invented — see payableDays.js's own header for the full formula and the four upstream
  ambiguities it inherits from D-29/D-30/D-35/D-22). Every invented cross-module rule lives in
  integrationPolicy.js. **No monetary amount is computed anywhere in this module** — payable
  days is a day count; multiplying it by a wage is payslip territory ([PDF §6]) and stops here.

Planned folders per the master roadmap — do not create them until their phase begins: none
remaining through Phase 09.

Nothing else belongs here yet.
