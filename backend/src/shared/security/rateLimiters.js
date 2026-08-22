/**
 * Phase 10 — Security Hardening, item 2. Rate limiting for POST /auth/signin and
 * POST /auth/refresh — the two unauthenticated endpoints that accept a caller-supplied secret
 * (password / refresh token) and are therefore brute-forceable.
 *
 * [RECOMMENDATION] Time-boxed backoff per IP, not permanent lockout: neither source document
 * specifies a policy, and a permanent-lockout scheme is itself a denial-of-service vector (an
 * attacker locks out a real user by deliberately failing their login). Window and thresholds are
 * a reasonable default, not a discovered requirement — tune via env if real traffic patterns
 * demand it later.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { sendError } = require('../response');
const { config } = require('../../config/db');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function rateLimited(res) {
  return sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Try again later.');
}

// The integration suite runs with --runInBand — every test file's signIn() calls share one IP
// (127.0.0.1) and one process, so a production-sized signin budget would 429 unrelated tests
// partway through the run, not just a deliberate brute-force test. `skip` (not a higher `max`)
// keeps the limiter's real behavior — and rateLimiters.test.js — testable in isolation instead
// of silently disabled by an env check inside the limiter logic itself.
const skipInTest = () => config.isTest;

// Keyed by IP + the identifier/token being attempted, not IP alone — so one caller hammering many
// different accounts from one IP is still throttled per-target, without a single shared IP (e.g.
// an office NAT) locking every user of that IP out of signing in at all.
const signInLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  // ipKeyGenerator (not raw req.ip) normalizes IPv6 addresses to their /64 subnet before use in
  // the composite key — required by express-rate-limit's own validation (ERR_ERL_KEY_GEN_IPV6):
  // an attacker with many IPv6 addresses in one subnet would otherwise get a fresh rate-limit
  // bucket per address.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body && req.body.identifier) || ''}`,
  handler: (req, res) => rateLimited(res),
});

const refreshLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: (req, res) => rateLimited(res),
});

module.exports = { signInLimiter, refreshLimiter };
