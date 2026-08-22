const express = require('express');
const { sendError } = require('../../shared/response');
const { config } = require('../../config/db');
const { requireAuth, requireRole } = require('../../shared/auth');
const { AuthError } = require('./errors');
const service = require('./service');

const router = express.Router();

const REFRESH_COOKIE_NAME = 'refreshToken';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AuthError) {
        return sendError(res, err.statusCode, err.code, err.message);
      }
      // eslint-disable-next-line no-console
      console.error('[dayflow:auth]', err);
      return sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
    }
  };
}

function readRefreshToken(req) {
  return (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || (req.body && req.body.refreshToken);
}

router.post(
  '/auth/signin',
  handle(async (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'identifier and password are required.');
    }

    const { user, accessToken, refreshToken } = await service.signIn({ identifier, password });
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    return res.status(200).json({
      accessToken,
      refreshToken,
      mustChangePassword: user.mustChangePassword,
      user: service.publicUser(user),
    });
  })
);

router.post(
  '/auth/refresh',
  handle(async (req, res) => {
    const rawToken = readRefreshToken(req);
    if (!rawToken) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Refresh token required.');
    }
    const { accessToken, refreshToken } = await service.refresh(rawToken);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    return res.status(200).json({ accessToken, refreshToken });
  })
);

router.post(
  '/auth/logout',
  requireAuth,
  handle(async (req, res) => {
    const rawToken = readRefreshToken(req);
    if (rawToken) {
      await service.logout(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME);
    return res.status(200).json({ status: 'ok' });
  })
);

router.post(
  '/auth/change-password',
  requireAuth,
  handle(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'currentPassword and newPassword are required.');
    }
    await service.changePassword(req.user.id, currentPassword, newPassword);
    return res.status(200).json({ status: 'ok' });
  })
);

// Path B — self-service signup (PDF §3.1.1). Gated by ENABLE_SELF_SERVICE_SIGNUP; returns 503
// (not 404) when disabled so it's clear the endpoint exists but is deliberately off.
router.post(
  '/auth/signup',
  handle(async (req, res) => {
    if (!service.selfServiceSignupEnabled()) {
      return sendError(res, 503, 'SIGNUP_DISABLED', 'Self-service signup is disabled.');
    }
    const { employeeId, email, password, role } = req.body || {};
    if (!employeeId || !email || !password || !role) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'employeeId, email, password, and role are required.');
    }
    const { user, verificationToken } = await service.signUp({ employeeId, email, password, role });
    return res.status(201).json({
      user: service.publicUser(user),
      // No real email service is integrated this phase — returning the raw token here is a
      // temporary testing affordance, not a delivery mechanism. See emailVerification.js.
      verificationToken,
    });
  })
);

router.post(
  '/auth/verify-email',
  handle(async (req, res) => {
    const { token } = req.body || {};
    if (!token) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'token is required.');
    }
    await service.verifyEmail(token);
    return res.status(200).json({ status: 'ok' });
  })
);

// Path A — admin-provisioned account creation (design's Note). Always available regardless of
// ENABLE_SELF_SERVICE_SIGNUP — see the Dual-Path Signup Handling note in the phase spec.
// Phase 03: the Phase 02 temporary inline role check has been replaced entirely by the shared
// requireAuth / requireRole('admin_hr') primitives below — no leftover inline check.
router.post(
  '/employees/provision',
  requireAuth,
  requireRole('admin_hr'),
  handle(async (req, res) => {
    const { firstName, lastName, email, dateOfJoining, department, location, role } = req.body || {};
    if (!firstName || !lastName || !email || !dateOfJoining) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'firstName, lastName, email, and dateOfJoining are required.');
    }
    const { user, profile, initialPassword } = await service.provisionEmployeeAccount(req.user, {
      firstName,
      lastName,
      email,
      dateOfJoining,
      department,
      location,
      role,
    });
    return res.status(201).json({
      user: service.publicUser(user),
      profile: { id: profile.id, name: profile.name, dateOfJoining: profile.dateOfJoining },
      // Returned once, synchronously, only to the calling admin — never stored or logged again.
      // TODO(D-19): temporary delivery behavior, see service.js.
      initialPassword,
    });
  })
);

module.exports = router;
