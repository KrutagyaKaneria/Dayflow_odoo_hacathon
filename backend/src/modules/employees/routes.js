const express = require('express');
const { sendError } = require('../../shared/response');
const { requireAuth, requireRole } = require('../../shared/auth');
const { EmployeeError } = require('./errors');
const {
  EMPLOYEE_EDITABLE_FIELDS,
  ADMIN_EDITABLE_PROFILE_FIELDS,
  ADMIN_EDITABLE_BANK_FIELDS,
  pickFields,
} = require('./editPolicy');
const { PUBLIC_PROFILE_FIELDS } = require('./publicProfilePolicy');
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

// [D-14 RESOLVED] The public subset a non-owner, non-admin coworker receives — built by
// narrowing the SAME full response shape toProfileResponse produces, so there is exactly one
// place ('id'/'name'/'department'/etc.) field names and mapping logic live. pickFields only
// copies keys that exist on the source, so anything not in PUBLIC_PROFILE_FIELDS (bankDetails,
// phone, dateOfBirth, residingAddress, nationality, personalEmail, gender, maritalStatus, ...) is
// ABSENT from the result object — never present as null or an empty string.
function toPublicProfileResponse(profile) {
  return pickFields(toProfileResponse(profile), PUBLIC_PROFILE_FIELDS);
}

function validateSkills(fields) {
  if ('skills' in fields && !Array.isArray(fields.skills)) {
    throw new EmployeeError(400, 'VALIDATION_ERROR', 'skills must be an array.');
  }
}

// GET /employees (Phase 05's listing endpoint) returns a DELIBERATELY MINIMAL projection to any
// authenticated user, regardless of role: { id, name, avatarUrl, statusIcon }. It does NOT return
// Private Info, Bank Details, Resume text, or anything else — this listing projection is
// unaffected by D-14 and stays exactly this minimal regardless of what GET /employees/:id below
// returns to a coworker. Clicking a card navigates to /profile/:id — see the D-14 RESOLVED note
// on GET /employees/:id below for what that route now returns to a non-owner, non-admin caller.
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

// [D-14 RESOLVED] Any authenticated caller may open a coworker's profile read-only, but only the
// owner or admin_hr receives the full profile — everyone else gets the PUBLIC_PROFILE_FIELDS
// subset (see publicProfilePolicy.js / toPublicProfileResponse above). No 403 branch remains for
// "authenticated but not owner/admin" — that used to be requireSelfOrRole's job; the
// owner-vs-everyone-else distinction now lives entirely in this handler, as a projection choice,
// not an authorization rejection. Salary (D-03, still OPEN) is untouched — it was never part of
// this endpoint's response shape and PUBLIC_PROFILE_FIELDS does not add it.
router.get(
  '/employees/:id',
  requireAuth,
  handle(async (req, res) => {
    const profile = await service.getProfileByUserId(req.params.id);
    const isOwnerOrAdmin = req.user.id === profile.userId || req.user.role === 'admin_hr';
    const body = isOwnerOrAdmin ? toProfileResponse(profile) : toPublicProfileResponse(profile);
    return res.status(200).json({ profile: body });
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
      Object.keys(bankFields).length > 0 ? bankFields : undefined,
      req.user.id
    );
    return res.status(200).json({ profile: toProfileResponse(profile) });
  })
);

module.exports = router;
