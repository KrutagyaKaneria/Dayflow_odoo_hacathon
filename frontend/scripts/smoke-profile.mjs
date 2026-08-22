/**
 * Profile screen smoke test — Phase 04 (ProfilePage tab logic, edit-affordance gating,
 * always-read-only Bank Details, stub tabs). Same technique as smoke-auth.mjs: Vite's SSR
 * module loader runs the real .jsx source in Node, react-dom/server renders it.
 *
 * useEffect (ProfilePage's data fetch) does not run under renderToStaticMarkup, so this tests
 * the pure computeTabSet helper directly instead of the full fetch-driven component — see that
 * function's docstring in ProfilePage.jsx.
 */
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`[smoke-profile] FAIL: ${message}`);
  process.exitCode = 1;
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });

try {
  const { computeTabSet } = await server.ssrLoadModule('/src/features/employees/ProfilePage.jsx');
  const { ResumeTab } = await server.ssrLoadModule('/src/features/employees/tabs/ResumeTab.jsx');
  const { PrivateInfoTab } = await server.ssrLoadModule('/src/features/employees/tabs/PrivateInfoTab.jsx');
  const { BankDetailsBlock } = await server.ssrLoadModule('/src/features/employees/BankDetailsBlock.jsx');
  const { SecurityStub } = await server.ssrLoadModule('/src/features/employees/tabs/SecurityStub.jsx');

  // 1. computeTabSet — the four viewing contexts ([D-14 RESOLVED] added the fourth).
  const employeeOwn = computeTabSet({ isOwnProfile: true, role: 'employee' });
  if (!employeeOwn.includes('security')) {
    fail(`Employee viewing own profile should see the Security tab, got: ${employeeOwn}`);
  }

  const adminOwn = computeTabSet({ isOwnProfile: true, role: 'admin_hr' });
  if (adminOwn.includes('security')) {
    fail(`Admin viewing own profile should NOT see the Security tab, got: ${adminOwn}`);
  }

  // Admin viewing someone else — UNCHANGED by D-14: full tabs (still view-only), no Security.
  const otherAsAdmin = computeTabSet({ isOwnProfile: false, role: 'admin_hr' });
  if (otherAsAdmin.includes('security')) {
    fail(`Admin viewing someone else's profile should NOT see the Security tab, got: ${otherAsAdmin}`);
  }
  for (const tabs of [employeeOwn, adminOwn, otherAsAdmin]) {
    if (!tabs.includes('resume') || !tabs.includes('private-info') || !tabs.includes('salary-info')) {
      fail(`Resume/Private Info/Salary Info must always be present, got: ${tabs}`);
    }
  }

  // [D-14 RESOLVED] A coworker (not owner, not admin_hr) viewing someone else's profile gets
  // ONLY the Resume tab — Private Info, Salary Info, and Security must all be absent. The
  // backend already narrows the DATA itself to PUBLIC_PROFILE_FIELDS for this exact caller; this
  // asserts the frontend doesn't even offer tabs whose content it has nothing legitimate to show.
  const otherAsEmployee = computeTabSet({ isOwnProfile: false, role: 'employee' });
  if (otherAsEmployee.length !== 1 || otherAsEmployee[0] !== 'resume') {
    fail(`A coworker viewing someone else's profile should see ONLY the Resume tab, got: ${otherAsEmployee}`);
  }

  // 2. Edit affordances only render when editable=true (own profile) — never for a view-only
  // (someone else's) profile, matching the "no edit affordances at all" requirement.
  const baseProfile = {
    about: 'Loves building things',
    jobLikes: 'The people',
    skills: ['React'],
    dateOfBirth: null,
    residingAddress: '123 Main St',
    nationality: 'Testland',
    personalEmail: 'me@example.com',
    gender: 'Nonbinary',
    maritalStatus: 'Single',
    phone: '+1-555-0100',
    dateOfJoining: '2023-01-01',
    bankDetails: { bankName: 'Test Bank', accountNumber: '12345', ifscCode: null, panNo: null, uanNo: null, empCode: null },
  };

  const resumeEditableMarkup = renderToStaticMarkup(
    React.createElement(ResumeTab, { profile: baseProfile, editable: true, onSave: () => {} })
  );
  if (!resumeEditableMarkup.includes('aria-label="Edit About"')) {
    fail('ResumeTab with editable=true should render an edit affordance for About');
  }

  const resumeReadOnlyMarkup = renderToStaticMarkup(
    React.createElement(ResumeTab, { profile: baseProfile, editable: false, onSave: () => {} })
  );
  if (resumeReadOnlyMarkup.includes('field-row__edit') || resumeReadOnlyMarkup.includes('+ Add Skills')) {
    fail('ResumeTab with editable=false (view-only, someone else\'s profile) must render no edit affordances');
  }

  const privateInfoEditableMarkup = renderToStaticMarkup(
    React.createElement(PrivateInfoTab, { profile: baseProfile, editable: true, onSave: () => {} })
  );
  if (!privateInfoEditableMarkup.includes('aria-label="Edit Residing Address"')) {
    fail('PrivateInfoTab with editable=true should render an edit affordance for Residing Address');
  }
  if (privateInfoEditableMarkup.includes('aria-label="Edit Nationality"')) {
    fail('PrivateInfoTab must never render an edit affordance for Nationality (not in EMPLOYEE_EDITABLE_FIELDS)');
  }

  const privateInfoReadOnlyMarkup = renderToStaticMarkup(
    React.createElement(PrivateInfoTab, { profile: baseProfile, editable: false, onSave: () => {} })
  );
  if (privateInfoReadOnlyMarkup.includes('field-row__edit')) {
    fail('PrivateInfoTab with editable=false must render no edit affordances at all');
  }

  // 3. Bank Details are always read-only, regardless of any editable flag — no button rendered.
  const bankMarkup = renderToStaticMarkup(React.createElement(BankDetailsBlock, { bankDetails: baseProfile.bankDetails }));
  if (bankMarkup.includes('<button')) {
    fail('BankDetailsBlock must never render an edit control');
  }
  if (!bankMarkup.includes('Test Bank')) {
    fail('BankDetailsBlock should render the supplied bank details');
  }

  // 4. Security remains a stub tab (Salary Info got real content in Phase 08 — see
  // scripts/smoke-payroll.mjs for its behavior).
  const securityMarkup = renderToStaticMarkup(React.createElement(SecurityStub));
  if (!securityMarkup.toLowerCase().includes('coming soon')) {
    fail('SecurityStub should render a visible-but-empty placeholder');
  }
} finally {
  await server.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('[smoke-profile] PASS: ProfilePage tab logic and edit-affordance gating behave correctly');
