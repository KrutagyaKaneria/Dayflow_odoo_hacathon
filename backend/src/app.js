const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { checkDbConnection, config } = require('./config/db');
const { sendError } = require('./shared/response');
const authRoutes = require('./modules/auth/routes');
const employeesRoutes = require('./modules/employees/routes');
const attendanceRoutes = require('./modules/attendance/routes');
const leaveRoutes = require('./modules/leave/routes');
const payrollRoutes = require('./modules/payroll/routes');

function createApp({ db = { checkDbConnection } } = {}) {
  const app = express();

  // Phase 10 — Security Hardening, item 8. Standard security headers (HSTS, X-Content-Type-Options,
  // X-Frame-Options, etc). `crossOriginResourcePolicy` is relaxed to same-site rather than the
  // default same-origin so /uploads (avatars) still load from the frontend's separate origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  app.use(express.json());
  app.use(cookieParser());

  // Phase 04 — serves locally-stored avatar uploads (see modules/employees/avatarUpload.js).
  // [RECOMMENDATION] Local disk is a documented default for this phase; no object-storage
  // service (S3 etc.) is being introduced ad hoc here.
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  // Phase 10 — Security Hardening, item 8. Replaces Phase 01's TEMP single-hardcoded-origin CORS
  // with an env-driven allow-list (CORS_ALLOWED_ORIGINS, config/env.js). No `credentials: true` is
  // set: the refresh-token cookie is SameSite=Lax (see auth/routes.js) and was never sent
  // cross-origin even under the old TEMP block (see frontend/src/features/auth/api.js's comment on
  // `logout`) — this phase does not change that behavior, only makes the origin list configurable
  // instead of hardcoded.
  app.use((req, res, next) => {
    const origin = req.header('Origin');
    if (origin && config.corsAllowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
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
