/**
 * Leave / Time-Off smoke test — Phase 07 (day-count preview, calendar day-status/holiday
 * mapping, status-label mapping, Admin/Employee role branch — including the D-31/D-15
 * "no balance banners or NEW button on the Admin screen" defaults). Same Vite-SSR-loader +
 * react-test-renderer technique as the other smoke-*.mjs scripts.
 */
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`[smoke-leave] FAIL: ${message}`);
  process.exitCode = 1;
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });

try {
  // react-router-dom must be ssrLoadModule'd FIRST, before any local module that transitively
  // imports it (Phase 10: RequireAuth.jsx, reached via the app/auth barrel that TimeOffPage.jsx
  // imports RequireRole from, now imports react-router-dom's <Navigate>) — loading the bare
  // package directly as a second, later ssrLoadModule target after it's already been pulled in
  // transitively produces a "module is not defined" SSR evaluation error. Same ordering
  // smoke-directory.mjs already used.
  const { MemoryRouter } = await server.ssrLoadModule('react-router-dom');
  const { previewDayCount } = await server.ssrLoadModule('/src/features/leave/dayCount.js');
  const { buildDayStatusMap, buildHolidaySet } = await server.ssrLoadModule('/src/features/leave/YearCalendar.jsx');
  const { STATUS_LABELS, LEAVE_TYPE_LABELS } = await server.ssrLoadModule('/src/features/leave/statusLabels.js');
  const { TimeOffPage } = await server.ssrLoadModule('/src/features/leave/TimeOffPage.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/app/auth/AuthContext.jsx');

  // 1. previewDayCount — same D-30 inclusive default as the backend, including the design's
  // known divergence (May 13 -> May 14 is 2 days here, not the mockup's 1).
  if (previewDayCount('2025-06-01', '2025-06-01') !== 1) fail('previewDayCount: same-day request should be 1 day');
  if (previewDayCount('2025-05-13', '2025-05-14') !== 2) {
    fail(`previewDayCount: May 13 -> May 14 should be 2 (D-30 inclusive default), got ${previewDayCount('2025-05-13', '2025-05-14')}`);
  }
  if (previewDayCount('2025-06-05', '2025-06-01') !== null) fail('previewDayCount should return null when end < start');
  if (previewDayCount('', '2025-06-01') !== null) fail('previewDayCount should return null when a date is missing');

  // 2. Calendar day-status / holiday mapping — pure functions.
  const dayStatus = buildDayStatusMap([{ startDate: '2025-06-01', endDate: '2025-06-03', status: 'approved' }]);
  if (dayStatus.get('2025-06-01') !== 'approved' || dayStatus.get('2025-06-03') !== 'approved') {
    fail('buildDayStatusMap should mark every day in an inclusive range with the request status');
  }
  if (dayStatus.get('2025-06-04') !== undefined) fail('buildDayStatusMap should not mark a day outside the range');

  const holidaySet = buildHolidaySet([{ date: '2026-01-26T00:00:00.000Z', name: 'Republic Day' }]);
  if (!holidaySet.has('2026-01-26')) fail('buildHolidaySet should key by the date-only portion');

  // 3. Status/type label mappings exist and cover all three/three enum values.
  if (JSON.stringify(Object.keys(STATUS_LABELS).sort()) !== JSON.stringify(['approved', 'pending', 'rejected'])) {
    fail('STATUS_LABELS should cover exactly pending/approved/rejected');
  }
  if (STATUS_LABELS.pending !== 'To Approve' || STATUS_LABELS.approved !== 'Validated' || STATUS_LABELS.rejected !== 'Refused') {
    fail('STATUS_LABELS should map to the design\'s To Approve/Validated/Refused labels');
  }
  if (!LEAVE_TYPE_LABELS.paid_time_off || !LEAVE_TYPE_LABELS.sick_leave || !LEAVE_TYPE_LABELS.unpaid_leave) {
    fail('LEAVE_TYPE_LABELS should cover all three leave types');
  }

  // 4. TimeOffPage role branch. Mock fetch so the Employee/Admin sub-pages' data-fetch effects
  // don't error (renderToStaticMarkup never runs them anyway, but the static shape is what we
  // assert here — no NEW button, no balance banners on the Admin screen).
  function withRole(role, children) {
    const authValue = { user: { id: 'u1', role }, accessToken: 'fake-token', setAccessToken: () => {}, logout: () => {} };
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(AuthContext.Provider, { value: authValue }, children)
    );
  }

  // renderToStaticMarkup never runs effects, so balance/records/holidays stay in their initial
  // (unloaded) state — "Paid time Off"/"Sick time off" banner LABELS are static and always
  // render regardless of load state; the "N Days Available" VALUE only appears once data
  // resolves, so it can't be asserted here. The label's presence/absence is what distinguishes
  // the Employee/Admin variants anyway (D-31: no banners at all on Admin).
  const employeeMarkup = renderToStaticMarkup(withRole('employee', React.createElement(TimeOffPage)));
  if (!employeeMarkup.includes('+ NEW')) fail('Employee Time Off view should render the NEW button');
  if (!employeeMarkup.includes('Paid time Off') || !employeeMarkup.includes('Sick time off')) {
    fail('Employee Time Off view should render both balance banner labels');
  }

  const adminMarkup = renderToStaticMarkup(withRole('admin_hr', React.createElement(TimeOffPage)));
  if (adminMarkup.includes('+ NEW')) fail('D-15: Admin Time Off view must NOT render a NEW button');
  if (adminMarkup.includes('Paid time Off') || adminMarkup.includes('Sick time off')) {
    fail('D-31: Admin Time Off view must NOT render balance banners');
  }
  if (!adminMarkup.includes('Allocation')) fail('Admin Time Off view should render the Allocation sub-tab');
} finally {
  await server.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('[smoke-leave] PASS: day-count preview, calendar mapping, status labels, and Admin/Employee role branch behave correctly');
