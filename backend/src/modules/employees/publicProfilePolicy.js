/**
 * [DECISION D-14 — RESOLVED] Fields visible to a non-owner, non-admin coworker viewing another
 * employee's profile read-only. Deliberately excludes all Private Info (DOB, residing_address,
 * nationality, personal_email, gender, marital_status), ALL Bank Details, and Salary (payroll
 * endpoint, D-03 — still OPEN and untouched by this decision). This is the single source of
 * truth for coworker-visible fields — do not scatter the projection logic elsewhere.
 *
 * No `jobPosition` field exists on employee_profiles (schema.prisma) — `department` serves that
 * role, per the decision's own allowance. `users.email` (work email) is deliberately EXCLUDED:
 * neither source document says whether it's directory-public, and the decision's own guidance is
 * to err toward less exposure when unsure.
 */
const PUBLIC_PROFILE_FIELDS = [
  'id',
  'name',
  'avatarUrl',
  'department',
  'managerId',
  'location',
  'about',
  'jobLikes',
  'skills',
];

module.exports = { PUBLIC_PROFILE_FIELDS };
