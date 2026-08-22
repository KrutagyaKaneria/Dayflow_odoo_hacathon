const fs = require('fs');
const path = require('path');
const express = require('express');
const { sendError } = require('../../shared/response');
const { requireAuth, requireRole } = require('../../shared/auth');
const { LeaveError } = require('./errors');
const { singleAttachmentUpload, ATTACHMENT_DIR } = require('./attachmentUpload');
const service = require('./service');

const router = express.Router();
const UUID_SHAPE = /^[0-9a-fA-F-]{36}$/;

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof LeaveError) {
        return sendError(res, err.statusCode, err.code, err.message);
      }
      // eslint-disable-next-line no-console
      console.error('[dayflow:leave]', err);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
    }
  };
}

function toRecordResponse(record) {
  return {
    id: record.id,
    leaveType: record.leaveType,
    startDate: record.startDate,
    endDate: record.endDate,
    daysCount: Number(record.daysCount),
    status: record.status,
    remarks: record.remarks,
    attachmentUrl: record.attachmentUrl,
    adminComment: record.adminComment,
    decidedByUserId: record.decidedByUserId,
    decidedAt: record.decidedAt,
    createdAt: record.createdAt,
  };
}

// Employee ID is never accepted from the request body — same construction as Phase 06's
// check-in. This removes impersonation as a concern by construction, so this endpoint needs no
// requireSelfOrRole (Phase 03).
router.post(
  '/leaves',
  requireAuth,
  handle(async (req, res) => {
    const { leaveType, startDate, endDate, remarks, attachmentUrl } = req.body || {};
    const { record, exceedsBalance } = await service.submitLeave(req.user.id, {
      leaveType,
      startDate,
      endDate,
      remarks,
      attachmentUrl,
    });
    return res.status(201).json({ record: toRecordResponse(record), exceedsBalance });
  })
);

router.get(
  '/leaves/me',
  requireAuth,
  handle(async (req, res) => {
    const year = typeof req.query.year === 'string' ? req.query.year : undefined;
    const result = await service.listMine(req.user.id, year);
    return res.status(200).json({ year: result.year, records: result.records.map(toRecordResponse) });
  })
);

router.get(
  '/leaves/balance',
  requireAuth,
  handle(async (req, res) => {
    const balance = await service.getBalance(req.user.id);
    return res.status(200).json({ balance });
  })
);

// Reuses Phase 04's avatar-upload VALIDATION approach (multer, type/size limits) — see
// attachmentUpload.js for why storage/serving deliberately diverges (medical documentation).
router.post(
  '/leaves/attachment',
  requireAuth,
  singleAttachmentUpload,
  handle(async (req, res) => {
    if (!req.file) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'An attachment file is required.');
    }
    const attachmentUrl = `/leaves/attachments/${req.user.id}/${req.file.filename}`;
    return res.status(201).json({ attachmentUrl });
  })
);

// Authenticated, ownership-checked attachment download — NOT statically served (unlike Phase
// 04's avatars). A sick-leave certificate is medical documentation; only the uploading employee
// or an Admin/HR may fetch it. This route isn't in the phase spec's endpoint table by name, but
// it's what makes the "Returns a URL to pass into POST /leaves" contract actually secure — see
// the attachment-isolation test in tests/integration.
router.get(
  '/leaves/attachments/:userId/:filename',
  requireAuth,
  handle(async (req, res) => {
    const { userId, filename } = req.params;
    if (!UUID_SHAPE.test(userId) || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid attachment reference.');
    }
    if (req.user.id !== userId && req.user.role !== 'admin_hr') {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to access this attachment.');
    }
    const filePath = path.join(ATTACHMENT_DIR, userId, filename);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, 'NOT_FOUND', 'Attachment not found.');
    }
    return res.sendFile(filePath);
  })
);

router.get(
  '/holidays',
  requireAuth,
  handle(async (req, res) => {
    const year = typeof req.query.year === 'string' ? req.query.year : undefined;
    const result = await service.getHolidays(req.user.id, year);
    return res.status(200).json({
      year: result.year,
      holidays: result.holidays.map((h) => ({ id: h.id, date: h.holidayDate, name: h.name })),
    });
  })
);

// Admin-only from here down.
router.get(
  '/leaves',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const records = await service.listAll({ status, search });
    return res.status(200).json({
      records: records.map((record) => ({
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

router.patch(
  '/leaves/:id/approve',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    if (!UUID_SHAPE.test(req.params.id)) {
      return sendError(res, 404, 'NOT_FOUND', 'Leave request not found.');
    }
    const { adminComment } = req.body || {};
    const record = await service.decide(req.user.id, req.params.id, 'approve', adminComment);
    return res.status(200).json({ record: toRecordResponse(record) });
  })
);

router.patch(
  '/leaves/:id/reject',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    if (!UUID_SHAPE.test(req.params.id)) {
      return sendError(res, 404, 'NOT_FOUND', 'Leave request not found.');
    }
    const { adminComment } = req.body || {};
    const record = await service.decide(req.user.id, req.params.id, 'reject', adminComment);
    return res.status(200).json({ record: toRecordResponse(record) });
  })
);

// D-09: read-only. No edit affordance, no allocation-adjustment endpoint anywhere in this module.
router.get(
  '/leaves/allocations',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const allocations = await service.listAllocations();
    return res.status(200).json({ allocations });
  })
);

module.exports = router;
