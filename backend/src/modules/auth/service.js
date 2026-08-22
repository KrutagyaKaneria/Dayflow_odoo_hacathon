const crypto = require('crypto');
const { prisma } = require('../../config/db');
const { AuthError } = require('./errors');
const { generateLoginId } = require('./loginId');
const { hashPassword, verifyPassword, generateInitialPassword, validatePasswordPolicy } = require('./password');
const { signAccessToken } = require('./tokens');
const refreshTokenStore = require('./refreshTokenStore');
const { issueEmailVerificationToken, verifyEmail: verifyEmailToken } = require('./emailVerification');
const { recordAuditEvent } = require('../../shared/audit/auditLog');

const VALID_ROLES = ['employee', 'admin_hr'];

// TODO(D-01): once resolved, either (a) delete Path B and its flag entirely, (b) delete Path A's
// public exposure and keep it as an internal-only admin tool, or (c) keep both as a hybrid. Do not
// make that call in this phase. Read live (not cached in config/env.js) so tests can flip it
// per-test without reloading modules — see the note in config/env.js.
function selfServiceSignupEnabled() {
  return process.env.ENABLE_SELF_SERVICE_SIGNUP === 'true';
}

function publicUser(user) {
  return { id: user.id, email: user.email, loginId: user.loginId, role: user.role };
}

// ---------------------------------------------------------------------------
// Sign In (both paths converge here)
// ---------------------------------------------------------------------------

async function signIn({ identifier, password }) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { loginId: identifier }] },
  });

  // Generic error on purpose — never reveal whether the identifier or the password was wrong.
  // TODO(D-18): forgot/reset-password does not exist yet; this is the point where a "forgot
  // password?" link would eventually plug in. Not built this phase — see hard-stop conditions.
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  // D-17 [CONFIRMED Phase 10]: unverified accounts are blocked from signing in.
  //   - Path A accounts have email_verified_at set at creation (see provisionEmployeeAccount) so
  //     they always pass this check.
  //   - Path B accounts are blocked until POST /auth/verify-email is called.
  // Reviewed during Phase 10's security-baseline pass and accepted as the shipping behavior —
  // ENABLE_SELF_SERVICE_SIGNUP is off by default (D-01 still open), so this mainly governs Path A
  // today, where it's already always-satisfied; it matters once/if Path B is enabled.
  if (!user.emailVerifiedAt) {
    throw new AuthError(403, 'EMAIL_NOT_VERIFIED', 'Email not verified.');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await refreshTokenStore.issueRefreshToken(user.id);

  // must_change_password is informational for the frontend, not a sign-in blocker — see
  // TODO in tests/integration for the forced-change-flow UX question deferred to Phase 04.
  return { user, accessToken, refreshToken };
}

async function refresh(rawToken) {
  return refreshTokenStore.rotateRefreshToken(rawToken);
}

async function logout(rawToken) {
  return refreshTokenStore.revokeRefreshToken(rawToken);
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    throw new AuthError(401, 'UNAUTHORIZED', 'User not found.');
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AuthError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  if (!validatePasswordPolicy(newPassword)) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'New password does not meet the minimum policy.');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });
}

// ---------------------------------------------------------------------------
// Path B — Self-service signup (PDF §3.1.1), gated by ENABLE_SELF_SERVICE_SIGNUP
// ---------------------------------------------------------------------------

async function signUp({ employeeId, email, password, role }) {
  if (!selfServiceSignupEnabled()) {
    throw new AuthError(503, 'SIGNUP_DISABLED', 'Self-service signup is disabled.');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'Invalid role.');
  }
  // PDF §3.1.1 lists Role as a self-service signup field; taken literally here. Letting a
  // self-registering caller pick admin_hr is a real privilege-escalation surface — flagged, not
  // silently restricted, since narrowing it beyond spec is itself a D-01-adjacent decision this
  // phase isn't authorized to make.
  if (!validatePasswordPolicy(password)) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'Password does not meet the minimum policy.');
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await prisma.user.create({
      data: { loginId: employeeId, email, passwordHash, role, emailVerifiedAt: null },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AuthError(409, 'ALREADY_EXISTS', 'Email or Employee ID is already in use.');
    }
    throw err;
  }

  const verificationToken = await issueEmailVerificationToken(user.id);
  return { user, verificationToken };
}

async function verifyEmail(rawToken) {
  await verifyEmailToken(rawToken);
}

// ---------------------------------------------------------------------------
// Path A — Admin-provisioned account creation (design's Note), always available
// ---------------------------------------------------------------------------

// Phase 10 — Security Hardening, item 10 (concurrency correctness). Raised from 5: with jitter
// added below, a burst of concurrent provisioning requests may need a few rounds to fully
// desync, and each request gets its own independent budget of attempts to do so.
const MAX_LOGIN_ID_ATTEMPTS = 10;

async function provisionEmployeeAccount(adminUser, { firstName, lastName, email, dateOfJoining, department, location, role }) {
  if (!adminUser.organizationId) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'Admin account has no organization to provision employees under.');
  }
  const organization = await prisma.organization.findUnique({ where: { id: adminUser.organizationId } });
  if (!organization) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'Organization not found.');
  }

  const joinDate = new Date(dateOfJoining);
  if (Number.isNaN(joinDate.getTime())) {
    throw new AuthError(400, 'VALIDATION_ERROR', 'Invalid dateOfJoining.');
  }
  const resolvedRole = role && VALID_ROLES.includes(role) ? role : 'employee';

  const initialPassword = generateInitialPassword();
  const passwordHash = await hashPassword(initialPassword);
  const joinYear = joinDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(joinYear, 0, 1));
  const yearEnd = new Date(Date.UTC(joinYear + 1, 0, 1));

  let lastError;
  for (let attempt = 0; attempt < MAX_LOGIN_ID_ATTEMPTS; attempt++) {
    // Serial number is derived from a count query; it is NOT trusted alone under concurrency — the
    // unique constraint on users.login_id is the real backstop, and a P2002 here just bumps the
    // attempt and retries (see catch below).
    //
    // Phase 10 — Security Hardening, item 10 (concurrency correctness): a bare `existingCount + 1
    // + attempt` LOCKSTEP-collides under real concurrency. N simultaneous requests all read the
    // same existingCount before any of them commits, so all N compute the SAME candidate on
    // attempt 0 and only one wins; the N-1 losers then all retry at attempt 1 and compute the
    // SAME next candidate as EACH OTHER again, and so on — they keep colliding with each other,
    // not converging, and can exhaust MAX_LOGIN_ID_ATTEMPTS purely from bad luck in a burst
    // (confirmed by a concurrency test that reproduced exactly this before this fix). Random
    // jitter on every retry (never on attempt 0, so the common uncontended case still gets the
    // next sequential serial number with no gap) desyncs concurrent retriers from each other.
    const existingCount = await prisma.employeeProfile.count({
      where: { organizationId: organization.id, dateOfJoining: { gte: yearStart, lt: yearEnd } },
    });
    const jitter = attempt === 0 ? 0 : crypto.randomInt(1, 10 * MAX_LOGIN_ID_ATTEMPTS);
    const serialNumber = existingCount + 1 + attempt + jitter;
    const loginId = generateLoginId({ companyName: organization.name, firstName, lastName, joinYear, serialNumber });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            organizationId: organization.id,
            loginId,
            email,
            passwordHash,
            role: resolvedRole,
            // [RECOMMENDATION] Admin-provisioned accounts have no PDF-mandated verification step,
            // so email_verified_at is set at creation. TODO(D-17): confirm this default, not
            // permanent — see the schema.prisma / migration comments for the same flag.
            emailVerifiedAt: new Date(),
            mustChangePassword: true,
            createdByUserId: adminUser.id,
          },
        });
        const profile = await tx.employeeProfile.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            name: `${firstName} ${lastName}`.trim(),
            department: department ?? null,
            location: location ?? null,
            dateOfJoining: joinDate,
          },
        });
        // D-23 audit trail — account provisioning. No password/hash in metadata — see
        // recordAuditEvent's docstring.
        await recordAuditEvent(tx, {
          actorUserId: adminUser.id,
          action: 'employee.provision',
          targetType: 'user',
          targetId: user.id,
          metadata: { role: resolvedRole, loginId },
        });

        return { user, profile };
      });

      // D-19 [RESOLVED Phase 10, non-production acceptance]: real out-of-band delivery (email/SMS)
      // is explicitly out of scope this phase (no sign-off was given, and Phase 10/11 both bar
      // building third-party email/SMS integration without one) — "show once in the provisioning
      // API response, to the calling admin only" is accepted as the shipping behavior for this
      // build, not a still-open TODO. Revisit if/when real delivery is authorized. The plaintext
      // password is never stored or logged past this point.
      return { user: result.user, profile: result.profile, initialPassword };
    } catch (err) {
      if (err.code === 'P2002') {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  // Phase 10: retries exhausted under sustained contention — a real (if now much rarer, thanks to
  // the jitter above) possibility, not a bug in itself. Surface a clean, actionable 409, not the
  // raw Prisma error — routes.js's `handle()` only special-cases AuthError, so an unwrapped error
  // here would otherwise fall through to an opaque 500 with no indication a retry would help.
  throw new AuthError(409, 'LOGIN_ID_ALLOCATION_CONFLICT', 'Could not allocate a unique login id under contention — please retry.');
}

module.exports = {
  signIn,
  refresh,
  logout,
  changePassword,
  signUp,
  verifyEmail,
  provisionEmployeeAccount,
  publicUser,
  selfServiceSignupEnabled,
};
