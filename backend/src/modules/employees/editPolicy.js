/**
 * Phase 04 — centralized field-level edit policy for employee_profiles / employee_bank_details.
 * Single source of truth: nothing in routes.js/service.js should special-case a field name
 * outside this file. If D-21 changes, this is the only file that needs to change.
 */

// [RECOMMENDATION pending D-21] Default policy: union of the PDF's explicit minimum
// (address, phone, picture) and the design's visibly-editable Resume-tab affordances
// (avatar, about, job_likes, skills). Private Info fields beyond address (DOB, nationality,
// personal_email, gender, marital_status) and all Bank Details fields are NOT employee-editable
// under this default, since neither source marks them editable by the employee.
// TODO(D-21): narrow or widen this list once the decision is recorded — this is the only
// place that needs to change.
const EMPLOYEE_EDITABLE_FIELDS = [
  'avatarUrl',
  'phone',
  'residingAddress',
  'about',
  'jobLikes',
  'skills',
];

// Admin can edit every core-identity + Resume + Private Info field (PDF §3.3.2, "Admin can edit
// all employee details") — EXCEPT:
//   - id / userId / organizationId / createdAt / updatedAt: system-managed, never client-editable.
//   - dateOfJoining: immutable after provisioning — the Login ID formula (Phase 02) is derived
//     from it, so changing it post hoc would desync an already-issued Login ID. No edit
//     affordance exists for it anywhere in the frontend either (see the profile screen).
//   - managerId: org-chart / reporting-line assignment is out of scope for Phase 04's Resume /
//     Private Info tabs; no UI exists for it yet either.
// Payroll (Phase 08) and Documents (D-13, not built) fields don't exist on this table at all,
// so they need no explicit exclusion here.
const ADMIN_EDITABLE_PROFILE_FIELDS = [
  'name',
  'department',
  'location',
  'avatarUrl',
  'phone',
  'about',
  'jobLikes',
  'skills',
  'dateOfBirth',
  'residingAddress',
  'nationality',
  'personalEmail',
  'gender',
  'maritalStatus',
];

// Bank Details — Admin-only (PDF §3.3.2's "all employee details" scope). No employee-editable
// version exists: EMPLOYEE_EDITABLE_FIELDS above deliberately has no Bank Details entries.
const ADMIN_EDITABLE_BANK_FIELDS = ['accountNumber', 'bankName', 'ifscCode', 'panNo', 'uanNo', 'empCode'];

// Returns a new object containing only the keys in `allowedFields` that are present in `source`.
// Used everywhere a client-supplied body needs to be narrowed to an allow-list before it reaches
// Prisma — never spread req.body directly into a .update() call (mass-assignment risk).
function pickFields(source, allowedFields) {
  const result = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }
  return result;
}

module.exports = {
  EMPLOYEE_EDITABLE_FIELDS,
  ADMIN_EDITABLE_PROFILE_FIELDS,
  ADMIN_EDITABLE_BANK_FIELDS,
  pickFields,
};
