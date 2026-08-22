const express = require('express');
const { sendError } = require('../../shared/response');
const { requireAuth, requireRole } = require('../../shared/auth');
const { PayrollError } = require('./errors');
const service = require('./service');
const { computePayableDaysForPeriod } = require('../integration/payableDays');

// [RECOMMENDATION resolving D-03] Interpretation adopted: an employee CAN VIEW their own salary
// structure but CANNOT EDIT it; only Admin/HR can view another employee's salary, and only
// Admin/HR can edit any salary. This is a SECURITY BOUNDARY (Security Baseline §5.1/§5.8),
// enforced below via requireAuth/requireRole on every route — not by hiding a frontend tab.
// TODO(D-03): if the stricter reading is confirmed instead (employees never see salary at all),
// the change is a single guard swap on GET /payroll/me plus hiding the tab — see
// payrollPolicy.js for the full reasoning and EMPLOYEE_CAN_VIEW_OWN_SALARY.
//
// On requireSelfOrRole (Phase 03): not used here either, same as Phase 06/07 — /me is
// self-scoped by construction and /:employeeId is admin-only under D-03's resolution, not
// ownership-checked. Four consecutive phases (06, 07, 08, 09) without a consumer — flagged in
// the phase report for a reviewer's attention, not silently accumulated.

const router = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof PayrollError) {
        return sendError(res, err.statusCode, err.code, err.message);
      }
      // eslint-disable-next-line no-console
      console.error('[dayflow:payroll]', err);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
    }
  };
}

function parsePayload(body) {
  const b = body || {};
  return {
    monthlyWage: typeof b.monthlyWage === 'number' ? b.monthlyWage : Number(b.monthlyWage),
    yearlyWage: typeof b.yearlyWage === 'number' ? b.yearlyWage : Number(b.yearlyWage),
    workingDaysPerWeek: b.workingDaysPerWeek != null ? Number(b.workingDaysPerWeek) : null,
    breakTimeHours: b.breakTimeHours != null ? Number(b.breakTimeHours) : null,
    components: Array.isArray(b.components) ? b.components : [],
  };
}

// GET /payroll/me must be registered before GET /payroll/:employeeId — otherwise Express would
// capture "me" as the :employeeId param (same discipline as Phase 04's /employees/me).
router.get(
  '/payroll/me',
  requireAuth,
  handle(async (req, res) => {
    const structure = await service.getForUserId(req.user.id);
    return res.status(200).json({ structure });
  })
);

router.get(
  '/payroll',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const structures = await service.listAll({ search });
    return res.status(200).json({ structures });
  })
);

// [D-03 boundary] Admin-only by ROLE, not ownership — an Employee calling this with their own
// user id still gets 403; they must use /payroll/me instead. Tested explicitly in
// tests/integration, the same discipline Phase 04 applied to PATCH /employees/:id.
router.get(
  '/payroll/:employeeId',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const structure = await service.getForUserId(req.params.employeeId);
    return res.status(200).json({ structure });
  })
);

router.patch(
  '/payroll/:employeeId',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const structure = await service.upsertForUserId(req.params.employeeId, parsePayload(req.body), req.user.id);
    return res.status(200).json({ structure });
  })
);

// Computes and returns figures for a candidate structure WITHOUT persisting — drives the
// design's live-recalculation-on-wage-change behavior without the frontend duplicating the
// engine (calculateSalary.js is the only place amounts are computed).
router.post(
  '/payroll/:employeeId/preview',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const preview = service.preview(parsePayload(req.body));
    return res.status(200).json({ structure: preview });
  })
);

// Phase 09, Part C. Admin-only, matching D-03's resolution for cross-employee payroll data — an
// Employee gets 403 here even with their own id, same as GET /payroll/:employeeId (they have no
// equivalent /payroll/me/payable-days route this phase, since payable days was never in scope
// for an employee's own view). No monetary amount is computed or returned — see
// modules/integration/payableDays.js's header for the full formula, the four upstream
// ambiguities it inherits, and why the payslip line stops here.
router.get(
  '/payroll/:employeeId/payable-days',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const employeeProfileId = await service.getEmployeeProfileIdByUserId(req.params.employeeId);
    const period = typeof req.query.period === 'string' ? req.query.period : undefined;
    const result = await computePayableDaysForPeriod(employeeProfileId, period);
    return res.status(200).json(result);
  })
);

module.exports = router;
