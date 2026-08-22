const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { checkDbConnection } = require('./config/db');
const { sendError } = require('./shared/response');
const authRoutes = require('./modules/auth/routes');
const employeesRoutes = require('./modules/employees/routes');
const attendanceRoutes = require('./modules/attendance/routes');
const leaveRoutes = require('./modules/leave/routes');
const payrollRoutes = require('./modules/payroll/routes');

function createApp({ db = { checkDbConnection } } = {}) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Phase 04 — serves locally-stored avatar uploads (see modules/employees/avatarUpload.js).
  // [RECOMMENDATION] Local disk is a documented default for this phase; no object-storage
  // service (S3 etc.) is being introduced ad hoc here.
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  // TEMP - revisit in Phase 10: bare-minimum CORS allow for local frontend dev only.
  // Full security middleware (CORS policy, rate limiting, etc.) begins in Phase 02/10.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // GET /health — the ONLY endpoint produced by Phase 01.
  app.get('/health', async (req, res) => {
    try {
      await db.checkDbConnection();
      res.status(200).json({ status: 'ok', db: 'connected' });
    } catch (err) {
      // Minimal application of the error envelope convention (see shared/README.md).
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Database connection failed.');
    }
  });

  // Phase 02 — auth: /auth/* and /employees/provision.
  app.use(authRoutes);

  // Phase 04 — employee profile management: /employees/me, /employees/:id.
  app.use(employeesRoutes);

  // Phase 06 — attendance: /attendance/check-in, /attendance/check-out, /attendance/today,
  // /attendance/me, /attendance (Admin day-scoped list).
  app.use(attendanceRoutes);

  // Phase 07 — leave: /leaves/*, /holidays. Attachment downloads are NOT under the public
  // /uploads static mount above — see modules/leave/attachmentUpload.js.
  app.use(leaveRoutes);

  // Phase 08 — payroll: /payroll/me, /payroll/:employeeId, /payroll, /payroll/:employeeId/preview.
  // No cross-module reads — this module never touches attendance_records or leave_requests.
  app.use(payrollRoutes);

  return app;
}

module.exports = { createApp };
