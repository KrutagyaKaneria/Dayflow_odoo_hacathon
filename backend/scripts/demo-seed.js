/**
 * Demo seed — populates a running Dayflow instance with realistic data for a full walkthrough
 * recording. Run AFTER Phases 01-09 are merged and D-14 is resolved.
 *
 * INSERTION METHOD: real API endpoints wherever one exists — this script authenticates against
 * and calls the actual running backend (fetch against BASE_URL), so it doubles as an end-to-end
 * smoke test of the real flows. Exactly TWO sections bypass the API, each fenced and justified
 * where it appears: `directDbSeed_bootstrapAdmin` (no endpoint can create the FIRST admin — see
 * its own comment) and `directDbSeed_historicalAttendance` (no endpoint writes backdated
 * attendance — D-07 admin-correction was never built). Public holidays also has no admin write
 * endpoint (GET /holidays is read-only) and is seeded direct-DB too, reusing dev-seed.js's exact
 * 2026 list — see directDbSeed_publicHolidays.
 *
 * PREREQUISITE: the real backend must be running (npm start / npm run dev) and reachable at
 * BASE_URL (default http://localhost:<PORT from .env>, override with DEMO_SEED_BASE_URL).
 *
 * Usage: node scripts/demo-seed.js   (from backend/)
 *
 * IDEMPOTENCY: safe to re-run. Provisioning is skipped (and existing credentials recovered) for
 * any employee whose exact demo name already appears in the directory (checked via the real
 * GET /employees API, never a direct DB read, to keep the API-first discipline even for
 * existence checks). Salary/Private-Info/Bank-Details PATCHes are naturally idempotent (always
 * set the same target values). Check-in/out rely on the backend's own ALREADY_CHECKED_IN /
 * NOT_CHECKED_IN 409s, caught and treated as already-done. Leave requests are tagged with a
 * `[DEMO SEED]` remarks prefix and skipped per employee+type if one already exists — this
 * protects against "ran it twice today" but is NOT date-exact across a re-run on a LATER day
 * (the whole seed is meant to run once, immediately before recording — see the report this
 * script was built to accompany for that scoping call). Historical attendance and holidays
 * upsert on their real unique keys — fully idempotent regardless of when re-run.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { prisma } = require('../src/config/db');
const { hashPassword, generateInitialPassword } = require('../src/modules/auth/password');
const { generateLoginId } = require('../src/modules/auth/loginId');
const {
  APP_TIMEZONE,
  STANDARD_WORK_HOURS,
  deriveAttendanceDate,
  computeHours,
} = require('../src/modules/attendance/attendancePolicy');

const BASE_URL = process.env.DEMO_SEED_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
const OUTPUT_PATH = path.join(__dirname, '..', 'seed-output.json');
const DEMO_PASSWORD = 'DemoPass123!'; // recorded in seed-output.json too — never hardcode this elsewhere
const DEMO_ORG_NAME = 'Dayflow Demo Co';
const BOOTSTRAP_ADMIN_EMAIL = 'admin@dayflowdemo.example';
const LEAVE_REMARKS_TAG = '[DEMO SEED]';

function log(message) {
  console.log(`[demo-seed] ${message}`);
}

// ---------------------------------------------------------------------------
// Thin HTTP client — mirrors frontend/src/features/*/api.js's request() shape so every call
// below reads the same way the real product's own frontend calls these endpoints.
// ---------------------------------------------------------------------------
async function apiFetch(pathname, { method = 'GET', token, body, isFormData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `${method} ${pathname} failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

async function signIn(identifier, password) {
  const data = await apiFetch('/auth/signin', { method: 'POST', body: { identifier, password } });
  return { accessToken: data.accessToken, user: data.user };
}

function pngBuffer() {
  // Full 8-byte PNG magic-byte signature + 2 padding bytes — sufficient for Phase 10's
  // content-sniffing (shared/security/fileSniffing.js checks only the leading signature, not
  // full file structure), so this is a valid, minimal "photo"/"attachment" for demo purposes.
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Best-effort partial write — see the call site's comment for why this exists. Failures here
// (e.g. a read-only filesystem) must never mask the real error further up the script.
function writeCredentialSnapshot(roster) {
  try {
    fs.writeFileSync(
      OUTPUT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          status: 'partial — script still running or crashed before completion',
          accounts: roster.map((emp) => ({
            name: `${emp.firstName} ${emp.lastName}`,
            email: emp.email,
            loginId: emp.loginId,
            password: emp.currentPassword,
          })),
        },
        null,
        2
      )
    );
  } catch (err) {
    log(`WARNING: could not write partial credential snapshot: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// FENCED DIRECT-DB SEED #1 — bootstrap admin (+ its organization).
//
// Every employee is created via POST /employees/provision, which requires an already-
// authenticated admin_hr caller. There is no API path to create the FIRST admin: Path A needs
// an existing admin, and Path B (self-service) is flag-gated off (ENABLE_SELF_SERVICE_SIGNUP)
// with its role-selection being the known privilege-escalation risk this project has
// deliberately not built a workaround for. This is a direct consequence of D-01 never being
// formally resolved. This is the ONLY account (and the one organization row it needs to exist
// under) created outside the API — reuses the app's own hashPassword/generateLoginId, never a
// hand-rolled hash. TODO(D-01): a proper first-admin bootstrap flow should be designed before
// production; this direct insert is a demo-seeding convenience, not a pattern to repeat.
// ---------------------------------------------------------------------------
async function directDbSeed_bootstrapAdmin() {
  let org = await prisma.organization.findFirst({ where: { name: DEMO_ORG_NAME } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: DEMO_ORG_NAME } });
    log(`created organization "${DEMO_ORG_NAME}"`);
  }

  const existing = await prisma.user.findUnique({ where: { email: BOOTSTRAP_ADMIN_EMAIL } });
  if (existing) {
    log(`bootstrap admin already exists (${BOOTSTRAP_ADMIN_EMAIL}) — reusing`);
    return { organization: org, email: BOOTSTRAP_ADMIN_EMAIL, password: DEMO_PASSWORD, loginId: existing.loginId };
  }

  const joinDate = new Date('2023-01-02T00:00:00.000Z');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const loginId = generateLoginId({
    companyName: DEMO_ORG_NAME,
    firstName: 'Admin',
    lastName: 'User',
    joinYear: joinDate.getUTCFullYear(),
    serialNumber: 1,
  });

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: org.id,
        loginId,
        email: BOOTSTRAP_ADMIN_EMAIL,
        passwordHash,
        role: 'admin_hr',
        emailVerifiedAt: new Date(),
        mustChangePassword: false,
      },
    });
    await tx.employeeProfile.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        name: 'Admin User',
        department: 'HR',
        location: 'Ahmedabad',
        dateOfJoining: joinDate,
      },
    });
  });
  log(`bootstrap admin created — login_id ${loginId}, email ${BOOTSTRAP_ADMIN_EMAIL}`);
  return { organization: org, email: BOOTSTRAP_ADMIN_EMAIL, password: DEMO_PASSWORD, loginId };
}

// ---------------------------------------------------------------------------
// FENCED DIRECT-DB SEED #2 — public holidays (reference data, no admin write endpoint exists;
// GET /holidays is read-only — see modules/leave/routes.js). Reuses the exact 2026 list already
// established in src/db/seeds/dev-seed.js rather than inventing a different set.
// ---------------------------------------------------------------------------
const PUBLIC_HOLIDAYS_2026 = [
  { date: '2026-01-14', name: 'Kite Festival' },
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Dhuleti' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-08-28', name: 'Rakhi' },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-11-08', name: 'Diwali' },
  { date: '2026-11-10', name: 'New Year' },
  { date: '2026-11-11', name: 'Bhai Duj' },
];

async function directDbSeed_publicHolidays() {
  for (const holiday of PUBLIC_HOLIDAYS_2026) {
    const holidayDate = new Date(`${holiday.date}T00:00:00.000Z`);
    const exists = await prisma.publicHoliday.findFirst({ where: { holidayDate, organizationId: null } });
    if (!exists) {
      await prisma.publicHoliday.create({ data: { holidayDate, name: holiday.name, organizationId: null } });
    }
  }
  log(`public holidays present: ${PUBLIC_HOLIDAYS_2026.length}`);
  return PUBLIC_HOLIDAYS_2026.map((h) => h.date);
}

// ---------------------------------------------------------------------------
// FENCED DIRECT-DB SEED #3 — historical attendance. No endpoint creates backdated attendance
// (D-07 admin-correction was never built; POST /attendance/check-in always stamps now()). Uses
// the SAME STANDARD_WORK_HOURS / deriveAttendanceDate / computeHours Phase 06 built — imported,
// never re-hardcoded. Never writes status='half_day' or 'leave' — status stays 'present' for
// every row here; half_day is D-06-unbuilt and leave-derivation is Phase 09's read-time concern,
// not something stored on these rows.
// ---------------------------------------------------------------------------
async function isHoliday(dateStr, holidayDateStrings) {
  return holidayDateStrings.includes(dateStr);
}

async function directDbSeed_historicalAttendance(employeeProfileId, holidayDateStrings) {
  const today = new Date();
  let written = 0;
  let cursor = addDays(today, -1); // start yesterday, walk backward
  let daysConsidered = 0;
  const GAP_EVERY = 9; // leaves a handful of gap days per employee over the ~6 week window

  while (written < 20 && daysConsidered < 45) {
    daysConsidered += 1;
    const dayOfWeek = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const dateStr = deriveAttendanceDate(cursor);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isGapDay = daysConsidered % GAP_EVERY === 0;

    if (!isWeekend && !(await isHoliday(dateStr, holidayDateStrings)) && !isGapDay) {
      const checkInHour = 9 + Math.random() * 0.75; // 09:30-10:15ish
      const checkOutHour = 18.5 + Math.random(); // 18:30-19:30ish
      const checkInAt = new Date(`${dateStr}T00:00:00.000Z`);
      checkInAt.setUTCHours(Math.floor(checkInHour), Math.round((checkInHour % 1) * 60));
      const checkOutAt = new Date(`${dateStr}T00:00:00.000Z`);
      checkOutAt.setUTCHours(Math.floor(checkOutHour), Math.round((checkOutHour % 1) * 60));

      const { workHours, extraHours } = computeHours(checkInAt, checkOutAt);

      await prisma.attendanceRecord.upsert({
        where: { employeeProfileId_attendanceDate: { employeeProfileId, attendanceDate: new Date(`${dateStr}T00:00:00.000Z`) } },
        create: {
          employeeProfileId,
          attendanceDate: new Date(`${dateStr}T00:00:00.000Z`),
          checkInAt,
          checkOutAt,
          workHours,
          extraHours,
          status: 'present',
        },
        update: {},
      });
      written += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return written;
}

// ---------------------------------------------------------------------------
// Employee roster — diverse names/departments. managerId is deliberately NOT set anywhere in
// this script: it is not in ADMIN_EDITABLE_PROFILE_FIELDS (see editPolicy.js — "org-chart /
// reporting-line assignment is out of scope for Phase 04's tabs; no UI exists for it either"),
// and POST /employees/provision does not accept it either. A PATCH /employees/:id carrying
// managerId would be silently dropped, not an error — this script does not send it at all,
// rather than sending a field the real API cannot act on. ADAPTATION from the master prompt's
// "assign a couple of them manager_id" — no endpoint accepts this field; skipped, noted here and
// in the final report, not worked around.
// ---------------------------------------------------------------------------
const EMPLOYEES = [
  {
    key: 'priya', firstName: 'Priya', lastName: 'Sharma', department: 'Engineering', location: 'Ahmedabad',
    dateOfJoining: '2023-06-12', dateOfBirth: '1994-03-11', gender: 'Female', maritalStatus: 'Single',
    nationality: 'Indian', personalizeResume: true, avatarUpload: true,
    monthlyWage: 78000,
  },
  {
    key: 'rahul', firstName: 'Rahul', lastName: 'Verma', department: 'Sales', location: 'Mumbai',
    dateOfJoining: '2024-02-01', dateOfBirth: '1991-07-22', gender: 'Male', maritalStatus: 'Married',
    nationality: 'Indian', personalizeResume: true, monthlyWage: 55000,
  },
  {
    key: 'ananya', firstName: 'Ananya', lastName: 'Iyer', department: 'Design', location: 'Bengaluru',
    dateOfJoining: '2023-11-20', dateOfBirth: '1996-01-05', gender: 'Female', maritalStatus: 'Single',
    nationality: 'Indian', personalizeResume: true, monthlyWage: 62000,
  },
  {
    key: 'vikram', firstName: 'Vikram', lastName: 'Nair', department: 'Finance', location: 'Ahmedabad',
    dateOfJoining: '2022-09-15', dateOfBirth: '1988-11-30', gender: 'Male', maritalStatus: 'Married',
    nationality: 'Indian', personalizeResume: true, monthlyWage: 90000,
  },
  {
    key: 'meera', firstName: 'Meera', lastName: 'Joshi', department: 'HR', location: 'Ahmedabad',
    dateOfJoining: '2023-03-01', dateOfBirth: '1990-05-18', gender: 'Female', maritalStatus: 'Married',
    nationality: 'Indian', role: 'admin_hr', monthlyWage: 72000,
  },
  {
    key: 'arjun', firstName: 'Arjun', lastName: 'Desai', department: 'Engineering', location: 'Pune',
    dateOfJoining: '2024-05-10', dateOfBirth: '1997-09-09', gender: 'Male', maritalStatus: 'Single',
    nationality: 'Indian', monthlyWage: 48000,
  },
  {
    key: 'kavya', firstName: 'Kavya', lastName: 'Reddy', department: 'Sales', location: 'Hyderabad',
    dateOfJoining: '2025-01-06', dateOfBirth: '1999-02-14', gender: 'Female', maritalStatus: 'Single',
    nationality: 'Indian', monthlyWage: 38000,
  },
  {
    key: 'rohan', firstName: 'Rohan', lastName: 'Mehta', department: 'Design', location: 'Mumbai',
    dateOfJoining: '2024-08-19', dateOfBirth: '1993-12-25', gender: 'Male', maritalStatus: 'Married',
    nationality: 'Indian', monthlyWage: 58000,
  },
  {
    key: 'sneha', firstName: 'Sneha', lastName: 'Kapoor', department: 'Finance', location: 'Delhi',
    dateOfJoining: '2025-04-02', dateOfBirth: '1995-06-08', gender: 'Female', maritalStatus: 'Single',
    nationality: 'Indian', monthlyWage: 42000,
  },
];

// [DESIGN] Same worked-example component ratios src/db/seeds/dev-seed.js uses — percentage-based
// components scale safely with wage (verified: grossSalary stays comfortably under any wage in
// the 35k-90k demo range asked for; see calculateSalary.js's D-34 constraint).
const SALARY_COMPONENTS = [
  { name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 50, description: '50% of Wage', displayOrder: 1 },
  { name: 'House Rent Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, description: '50% of Basic', displayOrder: 2 },
  { name: 'Standard Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 16.67, description: '16.67% of Basic', displayOrder: 3 },
  { name: 'Performance Bonus', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 8.33, description: '8.33% of Basic', displayOrder: 4 },
  { name: 'Leave Travel Allowance', componentKind: 'earning', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 1250, description: 'Fixed allowance', displayOrder: 5 },
  { name: 'PF (Employee)', componentKind: 'deduction_employee', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: '12% of Basic, deducted from pay', displayOrder: 6 },
  { name: 'PF (Employer)', componentKind: 'contribution_employer', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: '12% of Basic, employer cost only', displayOrder: 7 },
  { name: 'Professional Tax', componentKind: 'deduction_employee', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 200, description: 'Deducted from Gross salary', displayOrder: 8 },
];

async function provisionOrRecoverEmployee(adminToken, spec, index) {
  const fullName = `${spec.firstName} ${spec.lastName}`;
  const email = `${spec.firstName.toLowerCase()}.${spec.lastName.toLowerCase()}@dayflowdemo.example`;

  // Idempotent existence check via the REAL directory API (GET /employees), not a direct DB
  // read — matching "everything that CAN go through the API MUST" even for existence checks.
  const search = await apiFetch(`/employees?search=${encodeURIComponent(fullName)}`, { token: adminToken });
  const already = search.employees.find((e) => e.name === fullName);
  if (already) {
    log(`${fullName} already provisioned (userId ${already.id}) — reusing`);
    return { userId: already.id, loginId: null, password: null, email, alreadyExisted: true };
  }

  const result = await apiFetch('/employees/provision', {
    method: 'POST',
    token: adminToken,
    body: {
      firstName: spec.firstName,
      lastName: spec.lastName,
      email,
      dateOfJoining: spec.dateOfJoining,
      department: spec.department,
      location: spec.location,
      role: spec.role || 'employee',
    },
  });
  log(`provisioned ${fullName} — login_id ${result.user.loginId}`);
  return {
    userId: result.user.id,
    loginId: result.user.loginId,
    password: result.initialPassword,
    email,
    alreadyExisted: false,
  };
}

function fakeBankDetails(index) {
  const n = String(index + 1).padStart(4, '0');
  return {
    accountNumber: `DEMOACC${n}0000`,
    bankName: 'Demo Bank of India',
    ifscCode: `DEMO0${n}`,
    panNo: `DEMO${n}12F`,
    uanNo: `10000000${n}`,
    empCode: `EMP-${n}`,
  };
}

// A "recovered" (already-provisioned) employee has no fresh initialPassword this run — the ONLY
// place their current password is recorded is a PRIOR run's seed-output.json. Without this, any
// employee never routed through the change-password step (i.e. not in RESUME_CONTENT below)
// becomes permanently un-sign-in-able on a second run — a real gap the first idempotency test of
// this script surfaced (Arjun/Kavya/Rohan/Sneha/Meera's leave/attendance steps failed with
// "Invalid credentials" on re-run). Best-effort: a missing or unreadable file just means no
// fallback is available, not a hard failure.
function loadPreviousCredentials() {
  try {
    const prior = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    const map = new Map();
    for (const acc of prior.accounts || []) {
      if (acc.email && acc.password) map.set(acc.email, acc.password);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function main() {
  log(`target backend: ${BASE_URL}`);

  const previousCredentials = loadPreviousCredentials();

  const { organization } = await directDbSeed_bootstrapAdmin();
  const holidayDates = await directDbSeed_publicHolidays();

  const { accessToken: bootstrapToken } = await signIn(BOOTSTRAP_ADMIN_EMAIL, DEMO_PASSWORD);

  const roster = [];
  for (let i = 0; i < EMPLOYEES.length; i += 1) {
    const spec = EMPLOYEES[i];
    const provisioned = await provisionOrRecoverEmployee(bootstrapToken, spec, i);
    const currentPassword = provisioned.password || previousCredentials.get(provisioned.email) || null;
    roster.push({ ...spec, ...provisioned, currentPassword });
  }
  // Written immediately after provisioning (not only at the very end): a fresh initialPassword
  // returned by POST /employees/provision is shown to the caller exactly ONCE and never stored
  // anywhere server-side — if this script crashes further down before its final write, an
  // un-persisted initial password is permanently unrecoverable for that employee. This partial
  // snapshot is overwritten by the full output at the end of a successful run.
  writeCredentialSnapshot(roster);

  // Step 3 — admin fills Private Info + Bank Details (real API, PATCH /employees/:id).
  // dateOfJoining is NOT re-sent here: it's immutable after provisioning (not in
  // ADMIN_EDITABLE_PROFILE_FIELDS — see editPolicy.js), already set correctly at provision time.
  for (let i = 0; i < roster.length; i += 1) {
    const emp = roster[i];
    await apiFetch(`/employees/${emp.userId}`, {
      method: 'PATCH',
      token: bootstrapToken,
      body: {
        // PATCH /employees/:id does NOT coerce a bare YYYY-MM-DD the way POST
        // /employees/provision's dateOfJoining handling does — it passes the field straight to
        // Prisma, which requires a full ISO-8601 datetime for a DateTime column. ADAPTATION:
        // send a full ISO datetime here, not a bare date.
        dateOfBirth: new Date(`${emp.dateOfBirth}T00:00:00.000Z`).toISOString(),
        nationality: emp.nationality,
        gender: emp.gender,
        maritalStatus: emp.maritalStatus,
        personalEmail: `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}.personal@example.com`,
        bankDetails: fakeBankDetails(i),
      },
    });
  }
  log('Private Info + Bank Details set for all employees');

  // Step 5 — salary structures (real API, admin PATCH /payroll/:employeeId), varied wages.
  for (const emp of roster) {
    await apiFetch(`/payroll/${emp.userId}`, {
      method: 'PATCH',
      token: bootstrapToken,
      body: {
        monthlyWage: emp.monthlyWage,
        yearlyWage: emp.monthlyWage * 12,
        workingDaysPerWeek: 5,
        breakTimeHours: 1,
        components: SALARY_COMPONENTS,
      },
    });
  }
  log('salary structures set for all employees');

  // Step 4 — a subset of employees change their password and personalize their Resume tab
  // (real API: sign in with initial password -> POST /auth/change-password -> PATCH
  // /employees/me). For an employee recovered from a prior run (no known initial password),
  // this is skipped safely — DEMO_PASSWORD is tried directly instead, further down.
  const RESUME_CONTENT = {
    priya: { about: 'Full-stack engineer who loves clean APIs and cleaner git history.', jobLikes: 'Solving gnarly bugs with the team', skills: ['React', 'Node.js', 'PostgreSQL'], phone: '+91-98765-43001', residingAddress: '12 MG Road, Ahmedabad' },
    rahul: { about: 'Enterprise sales lead focused on long-term customer relationships.', jobLikes: 'Closing deals that actually help customers', skills: ['Negotiation', 'CRM', 'Forecasting'], phone: '+91-98765-43002', residingAddress: '45 Marine Drive, Mumbai' },
    ananya: { about: 'Product designer obsessed with accessible, delightful UI.', jobLikes: 'Turning fuzzy ideas into clear flows', skills: ['Figma', 'Design Systems', 'User Research'], phone: '+91-98765-43003', residingAddress: '7 Indiranagar, Bengaluru' },
    vikram: { about: 'Finance manager keeping the numbers honest.', jobLikes: 'Month-end close that actually closes on time', skills: ['Excel', 'Financial Modeling', 'Compliance'], phone: '+91-98765-43004', residingAddress: '3 Navrangpura, Ahmedabad' },
  };

  for (const emp of roster) {
    const content = RESUME_CONTENT[emp.key];
    if (!content) continue;

    let token;
    if (emp.currentPassword && emp.currentPassword !== DEMO_PASSWORD) {
      // Freshly provisioned this run (or recovered with a still-initial password) — has a known
      // current password to change from. Already at DEMO_PASSWORD (a prior run completed this
      // employee already) -> this whole block is skipped, not just made a harmless no-op.
      const { accessToken } = await signIn(emp.email, emp.currentPassword);
      try {
        await apiFetch('/auth/change-password', {
          method: 'POST',
          token: accessToken,
          body: { currentPassword: emp.currentPassword, newPassword: DEMO_PASSWORD },
        });
        emp.currentPassword = DEMO_PASSWORD;
        log(`${emp.firstName}: password changed to demo password`);
      } catch (err) {
        if (err.status !== 401) throw err; // already changed in an earlier partial run — fall through below
      }
    }
    // Recovered-from-a-prior-run OR just-changed: DEMO_PASSWORD should now work either way.
    const { accessToken } = await signIn(emp.email, emp.currentPassword || DEMO_PASSWORD);
    emp.currentPassword = DEMO_PASSWORD;
    token = accessToken;

    await apiFetch('/employees/me', { method: 'PATCH', token, body: content });

    if (emp.avatarUpload) {
      const form = new FormData();
      form.append('avatar', new Blob([pngBuffer()], { type: 'image/png' }), 'avatar.png');
      await apiFetch('/employees/me/avatar', { method: 'POST', token, isFormData: true, body: form });
      log(`${emp.firstName}: avatar uploaded`);
    }
  }
  log('Resume tabs personalized for the demo subset');
  writeCredentialSnapshot(roster); // password changes just happened — persist before leave/attendance

  // For every OTHER employee, resolve a working sign-in credential for the leave/attendance
  // steps below: freshly-provisioned ones already have emp.currentPassword (their initial
  // password); recovered-from-a-prior-run ones do not — DEMO_PASSWORD never applied to them, so
  // fall back to asking the admin to look nothing up (we simply cannot recover an unknown
  // initial password across runs) and instead reuse whatever's already usable. In practice this
  // only matters for a same-day re-run, where their emp.currentPassword is still set from this
  // same process's earlier provisioning step.
  async function tokenFor(emp) {
    const { accessToken } = await signIn(emp.email, emp.currentPassword || DEMO_PASSWORD);
    return accessToken;
  }

  // Step 6 — leave: all three types, all three states, one sick-leave-with-attachment, and two
  // employees on APPROVED leave covering today (feeds step 7's directory status icons).
  const today = new Date();
  const leavePlan = [
    { key: 'priya', leaveType: 'paid_time_off', start: addDays(today, -8), end: addDays(today, -6), decide: 'approve' },
    { key: 'rahul', leaveType: 'paid_time_off', start: today, end: addDays(today, 1), decide: 'approve' },
    { key: 'ananya', leaveType: 'sick_leave', start: today, end: today, decide: 'approve', withAttachment: true },
    { key: 'vikram', leaveType: 'unpaid_leave', start: addDays(today, 10), end: addDays(today, 11), decide: null },
    { key: 'arjun', leaveType: 'paid_time_off', start: addDays(today, 15), end: addDays(today, 16), decide: 'reject' },
  ];

  for (const plan of leavePlan) {
    const emp = roster.find((e) => e.key === plan.key);
    const employeeToken = await tokenFor(emp);

    // Idempotency: skip if a [DEMO SEED] record of this leaveType already exists for this
    // employee (see the module header for why this is same-day-safe, not date-exact).
    const mine = await apiFetch('/leaves/me', { token: employeeToken });
    const alreadySeeded = mine.records.some(
      (r) => r.leaveType === plan.leaveType && (r.remarks || '').startsWith(LEAVE_REMARKS_TAG)
    );
    if (alreadySeeded) {
      log(`${emp.firstName}: ${plan.leaveType} demo leave already seeded — skipping`);
      continue;
    }

    let attachmentUrl;
    if (plan.withAttachment) {
      const form = new FormData();
      form.append('attachment', new Blob([pngBuffer()], { type: 'image/png' }), 'medical-certificate.png');
      const uploadRes = await apiFetch('/leaves/attachment', { method: 'POST', token: employeeToken, isFormData: true, body: form });
      attachmentUrl = uploadRes.attachmentUrl;
    }

    let record;
    try {
      const submitRes = await apiFetch('/leaves', {
        method: 'POST',
        token: employeeToken,
        body: {
          leaveType: plan.leaveType,
          startDate: isoDate(plan.start),
          endDate: isoDate(plan.end),
          remarks: `${LEAVE_REMARKS_TAG} ${plan.leaveType.replace('_', ' ')}`,
          attachmentUrl,
        },
      });
      record = submitRes.record;
    } catch (err) {
      if (err.code === 'OVERLAPPING_LEAVE_REQUEST') {
        log(`${emp.firstName}: leave range overlaps an existing request — skipping (already seeded differently)`);
        continue;
      }
      throw err;
    }

    if (plan.decide) {
      try {
        await apiFetch(`/leaves/${record.id}/${plan.decide}`, {
          method: 'PATCH',
          token: bootstrapToken,
          body: plan.decide === 'reject' ? { adminComment: 'Team is short-staffed that week — please reschedule.' } : {},
        });
      } catch (err) {
        if (err.code !== 'LEAVE_ALREADY_DECIDED') throw err;
      }
    }
    log(`${emp.firstName}: ${plan.leaveType} leave seeded (${plan.decide || 'pending'})`);
  }

  // Step 7 — today's live attendance orchestration (real API). ~half check in (a couple also
  // check out); the on-leave-today employees (rahul, ananya) are deliberately skipped here — the
  // approved leave from step 6 already covers today for them; ~2 stay untouched -> "absent".
  const checkInToday = ['priya', 'meera', 'vikram', 'arjun', 'kavya'];
  const alsoCheckOut = ['priya', 'meera'];
  // rohan, sneha: deliberately no attendance action today -> derives to "absent".

  for (const key of checkInToday) {
    const emp = roster.find((e) => e.key === key);
    const token = await tokenFor(emp);
    try {
      await apiFetch('/attendance/check-in', { method: 'POST', token });
    } catch (err) {
      if (err.code !== 'ALREADY_CHECKED_IN') throw err;
    }
    if (alsoCheckOut.includes(key)) {
      try {
        await apiFetch('/attendance/check-out', { method: 'POST', token });
      } catch (err) {
        if (err.code !== 'NOT_CHECKED_IN' && !String(err.message).includes('already')) throw err;
      }
    }
  }
  log("today's attendance orchestrated (green/airplane/yellow mix)");

  // Step 8 (FENCED) — historical attendance, direct DB. See directDbSeed_historicalAttendance's
  // own header comment for why no endpoint can do this.
  const attendanceSummary = {};
  for (const emp of roster) {
    const profile = await prisma.employeeProfile.findUnique({ where: { userId: emp.userId }, select: { id: true } });
    const written = await directDbSeed_historicalAttendance(profile.id, holidayDates);
    attendanceSummary[emp.key] = written;
  }
  log('historical attendance seeded for all employees');

  // Step 10 — summary output.
  const accountRoster = [
    { role: 'admin_hr (bootstrap)', name: 'Admin User', email: BOOTSTRAP_ADMIN_EMAIL, loginId: (await prisma.user.findUnique({ where: { email: BOOTSTRAP_ADMIN_EMAIL } })).loginId, password: DEMO_PASSWORD },
    ...roster.map((emp) => ({
      role: emp.role || 'employee',
      name: `${emp.firstName} ${emp.lastName}`,
      email: emp.email,
      loginId: emp.loginId || '(recovered from a prior run — see backend logs from that run)',
      password: emp.currentPassword || DEMO_PASSWORD,
    })),
  ];

  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    organization: DEMO_ORG_NAME,
    accounts: accountRoster,
    perEmployeeSummary: roster.map((emp) => ({
      name: `${emp.firstName} ${emp.lastName}`,
      department: emp.department,
      monthlyWage: emp.monthlyWage,
      historicalAttendanceDaysWritten: attendanceSummary[emp.key],
      resumePersonalized: Boolean(RESUME_CONTENT[emp.key]),
      leaveSeeded: leavePlan.find((p) => p.key === emp.key)?.leaveType || null,
    })),
    todayStatus: {
      checkedIn: checkInToday.filter((k) => !alsoCheckOut.includes(k)),
      checkedInAndOut: alsoCheckOut,
      onLeave: ['rahul', 'ananya'],
      absent: ['rohan', 'sneha'],
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  log(`wrote ${OUTPUT_PATH}`);
  log('DONE.');
}

main()
  .catch((err) => {
    console.error(`[demo-seed] FAILED: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
