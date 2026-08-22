/**
 * Attendance smoke test — Phase 06 (month/date nav helpers, check-in/out widget states, nav
 * status dot color, Admin/Employee role branch). Same Vite-SSR-loader + react-test-renderer
 * technique as the other smoke-*.mjs scripts.
 */
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`[smoke-attendance] FAIL: ${message}`);
  process.exitCode = 1;
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });

try {
  // react-router-dom must be ssrLoadModule'd FIRST, before any local module that transitively
  // imports it (Phase 10: RequireAuth.jsx, reached via the app/auth barrel that AttendancePage.jsx
  // imports RequireRole from, now imports react-router-dom's <Navigate>) — loading the bare
  // package directly as a second, later ssrLoadModule target after it's already been pulled in
  // transitively produces a "module is not defined" SSR evaluation error. Same ordering
  // smoke-directory.mjs already used.
  const { MemoryRouter } = await server.ssrLoadModule('react-router-dom');
  const { currentMonth, shiftMonth, formatMonthLabel } = await server.ssrLoadModule(
    '/src/features/attendance/monthUtils.js'
  );
  const { shiftDate, formatDateHeader } = await server.ssrLoadModule('/src/features/attendance/dateUtils.js');
  const { AttendanceWidget } = await server.ssrLoadModule('/src/app/nav/AttendanceWidget.jsx');
  const { AttendancePage } = await server.ssrLoadModule('/src/features/attendance/AttendancePage.jsx');
  const { isNavStatusDotGreen } = await server.ssrLoadModule('/src/app/nav/attendanceStatusDot.js');
  const { AuthContext } = await server.ssrLoadModule('/src/app/auth/AuthContext.jsx');

  // R-D08: nav status dot is green only while checked in AND not yet checked out; red otherwise
  // (including after check-out — see the [INFERENCE] note in TopNav.jsx).
  if (isNavStatusDotGreen({ checkedIn: false, checkedOut: false }) !== false) {
    fail('nav status dot should be red (false) before check-in');
  }
  if (isNavStatusDotGreen({ checkedIn: true, checkedOut: false }) !== true) {
    fail('nav status dot should be green (true) while checked in and not checked out');
  }
  if (isNavStatusDotGreen({ checkedIn: true, checkedOut: true }) !== false) {
    fail('nav status dot should revert to red (false) after check-out');
  }

  // 1. Pure month/date helpers.
  if (shiftMonth('2024-01', 1) !== '2024-02') fail('shiftMonth should roll forward within a year');
  if (shiftMonth('2024-12', 1) !== '2025-01') fail('shiftMonth should roll over into the next year');
  if (shiftMonth('2024-01', -1) !== '2023-12') fail('shiftMonth should roll backward across a year boundary');
  if (!/^\d{4}-\d{2}$/.test(currentMonth())) fail('currentMonth should return YYYY-MM');
  if (formatMonthLabel('2025-10') !== 'October 2025') {
    fail(`formatMonthLabel('2025-10') should be "October 2025", got: ${formatMonthLabel('2025-10')}`);
  }

  if (shiftDate('2025-10-22', 1) !== '2025-10-23') fail('shiftDate should roll forward within a month');
  if (shiftDate('2025-10-01', -1) !== '2025-09-30') fail('shiftDate should roll backward across a month boundary');
  // [DESIGN] "22, October 2025" style.
  if (formatDateHeader('2025-10-22') !== '22, October 2025') {
    fail(`formatDateHeader('2025-10-22') should be "22, October 2025", got: ${formatDateHeader('2025-10-22')}`);
  }

  // 2. AttendanceWidget — the three states (not checked in / checked in / checked out).
  const notCheckedInMarkup = renderToStaticMarkup(
    React.createElement(AttendanceWidget, { attendance: { checkedIn: false, checkedOut: false, checkInAt: null } })
  );
  if (!notCheckedInMarkup.includes('Check IN')) fail('AttendanceWidget should show "Check IN →" when not checked in');

  const checkedInMarkup = renderToStaticMarkup(
    React.createElement(AttendanceWidget, {
      attendance: { checkedIn: true, checkedOut: false, checkInAt: '2024-01-01T10:00:00.000Z' },
    })
  );
  if (!checkedInMarkup.includes('Since') || !checkedInMarkup.includes('Check Out')) {
    fail('AttendanceWidget should show "Since HH:MM" and "Check Out →" when checked in');
  }

  const checkedOutMarkup = renderToStaticMarkup(
    React.createElement(AttendanceWidget, {
      attendance: { checkedIn: true, checkedOut: true, checkInAt: '2024-01-01T10:00:00.000Z' },
    })
  );
  if (checkedOutMarkup.includes('Check IN') || checkedOutMarkup.includes('Check Out →')) {
    fail('AttendanceWidget must not re-offer check-in/out once checked out for the day');
  }

  // 3. AttendancePage role branch — Employee gets the month view, Admin gets the day view.
  function withRole(role, children) {
    const authValue = { user: { id: 'u1', role }, accessToken: 'fake-token', setAccessToken: () => {}, logout: () => {} };
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(AuthContext.Provider, { value: authValue }, children)
    );
  }

  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCallCount += 1;
    return { ok: true, json: async () => ({ records: [], summary: { daysPresent: 0, leavesCount: 0, totalWorkingDays: null }, date: '2025-01-01' }) };
  };
  let renderer;
  try {
    await act(async () => {
      renderer = create(withRole('employee', React.createElement(AttendancePage)));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const employeeMarkup = renderer.toJSON();
    const employeeHasSearch = renderer.root.findAllByProps({ type: 'search' }).length > 0;
    if (employeeHasSearch) fail('Employee attendance view should not render the Admin search bar');
    if (!JSON.stringify(employeeMarkup).includes('Days Present')) {
      fail('Employee attendance view should render the summary chips');
    }
  } finally {
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
  }

  let adminRenderer;
  try {
    await act(async () => {
      adminRenderer = create(withRole('admin_hr', React.createElement(AttendancePage)));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const adminHasSearch = adminRenderer.root.findAllByProps({ type: 'search' }).length > 0;
    if (!adminHasSearch) fail('Admin attendance view should render the search bar');
  } finally {
    if (adminRenderer) {
      await act(async () => {
        adminRenderer.unmount();
      });
    }
    globalThis.fetch = originalFetch;
  }

  if (fetchCallCount < 1) fail('expected at least one fetch across the role-branch render passes');
} finally {
  await server.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('[smoke-attendance] PASS: month/date nav helpers, widget states, and Admin/Employee role branch behave correctly');
