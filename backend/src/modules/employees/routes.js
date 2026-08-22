const express = require('express');
const { sendError } = require('../../shared/response');
const { requireAuth, requireRole, requireSelfOrRole } = require('../../shared/auth');
const { EmployeeError } = require('./errors');
const {
  EMPLOYEE_EDITABLE_FIELDS,
  ADMIN_EDITABLE_PROFILE_FIELDS,
  ADMIN_EDITABLE_BANK_FIELDS,
  pickFields,
} = require('./editPolicy');
const { singleAvatarUpload } = require('./avatarUpload');
const service = require('./service');

// TODO(D-13): the PDF's Documents section (§3.3.1) is deliberately not implemented anywhere in
// this module. Neither source document specifies its fields, upload behavior, or storage model,
// and it has no corresponding design screen — inventing one from nothing was explicitly out of
// scope for Phase 04. No route, table, or upload path exists for it here.

const router = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof EmployeeError) {
        return sendError(res, err.statusCode, err.code, err.message);
      }
      // eslint-disable-next-line no-console
      console.error('[dayflow:employees]', err);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
    }
  };
}

function toProfileResponse(profile) {
  return {
    id: profile.id,
    userId: profile.userId,
    organizationId: profile.organizationId,
    name: profile.name,
    department: profile.department,
    managerId: profile.managerId,
    location: profile.location,
    dateOfJoining: profile.dateOfJoining,
    avatarUrl: profile.avatarUrl,
    about: profile.about,
    jobLikes: profile.jobLikes,
    skills: profile.skills,
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth,
    residingAddress: profile.residingAddress,
    nationality: profile.nationality,
    personalEmail: profile.personalEmail,
    gender: profile.gender,
    maritalStatus: profile.maritalStatus,
    bankDetails: profile.bankDetails
      ? {
          accountNumber: profile.bankDetails.accountNumber,
          bankName: profile.bankDetails.bankName,
          ifscCode: profile.bankDetails.ifscCode,
          panNo: profile.bankDetails.panNo,
          uanNo: profile.bankDetails.uanNo,
          empCode: profile.bankDetails.empCode,
        }
      : null,
  };
}

function validateSkills(fields) {
  if ('skills' in fields && !Array.isArray(fields.skills)) {
    throw new EmployeeError(400, 'VALIDATION_ERROR', 'skills must be an array.');
  }
}

// [RECOMMENDATION pending D-14] GET /employees (this phase's new listing endpoint) returns a
// DELIBERATELY MINIMAL projection to any authenticated user, regardless of role: { id, name,
// avatarUrl, statusIcon }. It does NOT return Private Info, Bank Details, Resume text, or
// anything Phase 04 guards. Clicking a card navigates to /profile/:id (Phase 04's existing
// route), which will correctly 403 for a non-owner, non-admin Employee per Phase 04's UNCHANGED
// guard on GET /employees/:id below — this phase does not loosen that guard.
// TODO(D-14): if the decision is that Employees CAN view coworkers' full profiles read-only,
// Phase 04's requireSelfOrRole guard on GET /employees/:id needs a third branch (allow any
// authenticated caller, but strip Private Info/Bank Details for non-owner-non-admin callers) —
// that change belongs in Phase 04's code, not here. This phase's job is only to make the
// directory itself functional without silently widening Phase 04's access control.
//
// TODO: no empty-state or zero-results handling is specified by either source for this list.
// This returns a plain empty array on zero results and lets the frontend render its own
// "no employees found" state — not a backend concern beyond returning an empty array correctly.
router.get(
  '/employees',
  requireAuth,
  handle(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const result = await service.listEmployees({ search, page });
    return res.status(200).json(result);
  })
);

// GET/PATCH /employees/me must be registered before GET/PATCH /employees/:id — otherwise
// Express would capture "me" as the :id param.
router.get(
  '/employees/me',
  requireAuth,
  handle(async (req, res) => {
    const profile = await service.getProfileByUserId(req.user.id);
    return res.status(200).json({ profile: toProfileResponse(profile) });
  })
);

router.patch(
  '/employees/me',
  requireAuth,
  handle(async (req, res) => {
    // Disallowed fields are silently dropped, not rejected — a partial-update client sending
    // more than it should must not have its whole request fail. See editPolicy.js (D-21).
    const fields = pickFields(req.body || {}, EMPLOYEE_EDITABLE_FIELDS);
    validateSkills(fields);
    const profile = await service.updateOwnProfile(req.user.id, fields);
    return res.status(200).json({ profile: toProfileResponse(profile) });
  })
);

router.post(
  '/employees/me/avatar',
  requireAuth,
  singleAvatarUpload,
  handle(async (req, res) => {
    if (!req.file) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'An avatar file is required.');
    }
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const profile = await service.updateOwnProfile(req.user.id, { avatarUrl });
    return res.status(200).json({ profile: toProfileResponse(profile) });
  })
);

// employee_profiles is keyed 1:1 by user_id, and :id here addresses the user — the same
// identifier space /employees/me resolves via req.user.id — so no DB lookup is needed to know
// whose resource this is; requireSelfOrRole just needs the param itself.
function getRouteUserId(req) {
  return req.params.id;
}

// [D-14 still open, conservative default] Owner or Admin/HR only — the design's "view-only mode"
// note doesn't say whether any authenticated Employee can open a coworker's profile, so this
// phase does NOT allow that yet.
// TODO(D-14): if the decision is that any authenticated Employee can view coworkers in
// read-only mode, this guard needs a third branch (e.g., allow any authenticated user but strip
// Private Info/Bank Details fields for non-owner-non-admin callers). Not built speculatively —
// flagged only.
router.get(
  '/employees/:id',
  requireAuth,
  requireSelfOrRole(getRouteUserId, 'admin_hr'),
  handle(async (req, res) => {
    const profile = await service.getProfileByUserId(req.params.id);
    return res.status(200).json({ profile: toProfileResponse(profile) });
  })
);

// Admin-only, full field edit rights (excluding Payroll/Documents fields, which don't exist on
// this table). An Employee must use PATCH /employees/me instead — requireRole rejects them here
// even on their own id, intentionally: /me is the only self-edit path and it's field-restricted.
router.patch(
  '/employees/:id',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const body = req.body || {};
    const profileFields = pickFields(body, ADMIN_EDITABLE_PROFILE_FIELDS);
    validateSkills(profileFields);
    const bankFieldsRaw = body.bankDetails && typeof body.bankDetails === 'object' ? body.bankDetails : {};
    const bankFields = pickFields(bankFieldsRaw, ADMIN_EDITABLE_BANK_FIELDS);
    const profile = await service.adminUpdateProfile(
      req.params.id,
      profileFields,
      Object.keys(bankFields).length > 0 ? bankFields : undefined
    );
    return res.status(200).json({ profile: toProfileResponse(profile) });
  })
);

module.exports = router;
