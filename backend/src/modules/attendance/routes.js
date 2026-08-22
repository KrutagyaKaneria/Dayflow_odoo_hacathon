const express = require('express');
const { sendError } = require('../../shared/response');
const { requireAuth, requireRole } = require('../../shared/auth');
const { AttendanceError } = require('./errors');
const service = require('./service');

const router = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AttendanceError) {
        return sendError(res, err.statusCode, err.code, err.message);
      }
      // eslint-disable-next-line no-console
      console.error('[dayflow:attendance]', err);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
    }
  };
}

function toRecordResponse(record) {
  return {
    id: record.id,
    attendanceDate: record.attendanceDate,
    checkInAt: record.checkInAt,
    checkOutAt: record.checkOutAt,
    workHours: record.workHours != null ? Number(record.workHours) : null,
    extraHours: record.extraHours != null ? Number(record.extraHours) : null,
    status: record.status,
  };
}

// Both check-in and check-out act only on req.user's own profile — the employee id is never
// accepted from the request body. That removes impersonation as a concern by construction, so
// neither endpoint needs requireSelfOrRole (Phase 03).
router.post(
  '/attendance/check-in',
  requireAuth,
  handle(async (req, res) => {
    const record = await service.checkIn(req.user.id);
    return res.status(201).json({ record: toRecordResponse(record) });
  })
);

router.post(
  '/attendance/check-out',
  requireAuth,
  handle(async (req, res) => {
    const record = await service.checkOut(req.user.id);
    return res.status(200).json({ record: toRecordResponse(record) });
  })
);

// Drives the check-in/out widget and the nav status dot (R-D08).
router.get(
  '/attendance/today',
  requireAuth,
  handle(async (req, res) => {
    const state = await service.getToday(req.user.id);
    return res.status(200).json(state);
  })
);

router.get(
  '/attendance/me',
  requireAuth,
  handle(async (req, res) => {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const result = await service.getMyMonth(req.user.id, month);
    return res.status(200).json({
      month: result.month,
      records: result.records.map(toRecordResponse),
      summary: result.summary,
    });
  })
);

// Admin/HR only, day-scoped across all employees per [DESIGN] (R-D09). No requireSelfOrRole
// needed here either — this route is role-gated, not ownership-gated (see the "Where
// requireSelfOrRole fits" note in the phase spec: none of these five endpoints needs it).
router.get(
  '/attendance',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const result = await service.listForDate({ date, search });
    return res.status(200).json({
      date: result.date,
      records: result.records.map((record) => ({
        ...toRecordResponse(record),
        employee: {
          id: record.employeeProfile.userId,
          name: record.employeeProfile.name,
          avatarUrl: record.employeeProfile.avatarUrl,
        },
      })),
    });
  })
);

module.exports = router;
