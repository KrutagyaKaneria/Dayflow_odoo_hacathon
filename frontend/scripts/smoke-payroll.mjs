/**
 * Salary Info tab smoke test — Phase 08. Verifies the D-03 edit-boundary divergence (Admin can
 * edit even when viewing someone else's profile — the one tab on this page where that's true),
 * the empty state's Admin-only create affordance, and the components editor's Basic-radio
 * exclusivity. Same Vite-SSR-loader + react-test-renderer technique as the other smoke-*.mjs
 * scripts; interactive (react-test-renderer + act) because effects need to run.
 */
import { createServer } from 'vite';
import React from 'react';
import { act, create } from 'react-test-renderer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`[smoke-payroll] FAIL: ${message}`);
  process.exitCode = 1;
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });

try {
  const { SalaryInfoTab } = await server.ssrLoadModule('/src/features/employees/tabs/SalaryInfoTab.jsx');
  const { SalaryComponentsEditor } = await server.ssrLoadModule('/src/features/payroll/SalaryComponentsEditor.jsx');
  const { AuthContext } = await server.ssrLoadModule('/src/app/auth/AuthContext.jsx');

  function withAuth(role, children) {
    const authValue = { user: { id: 'u1', role }, accessToken: 'fake-token', setAccessToken: () => {}, logout: () => {} };
    return React.createElement(AuthContext.Provider, { value: authValue }, children);
  }

  async function mountWithFetch(fetchImpl, role, props) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    let renderer;
    try {
      await act(async () => {
        renderer = create(withAuth(role, React.createElement(SalaryInfoTab, props)));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      return renderer;
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const noStructureFetch = async () => ({
    ok: false,
    json: async () => ({ error: { code: 'NO_SALARY_STRUCTURE', message: 'No salary structure has been configured for this employee.' } }),
  });

  // 1. Empty state: Employee gets no create affordance; Admin does.
  {
    const renderer = await mountWithFetch(noStructureFetch, 'employee', { employeeId: 'u1', isOwnProfile: true, viewerRole: 'employee' });
    const markup = JSON.stringify(renderer.toJSON());
    if (!markup.includes('No salary structure configured')) fail('Empty state message should render when no structure exists');
    if (markup.includes('Create salary structure')) fail('Employee must not see the create-structure affordance');
    await act(async () => renderer.unmount());
  }
  {
    const renderer = await mountWithFetch(noStructureFetch, 'admin_hr', { employeeId: 'u2', isOwnProfile: false, viewerRole: 'admin_hr' });
    const markup = JSON.stringify(renderer.toJSON());
    if (!markup.includes('Create salary structure')) fail('Admin should see the create-structure affordance');
    await act(async () => renderer.unmount());
  }

  // 2. D-03 divergence: Admin gets an Edit button even when NOT viewing their own profile — the
  // one tab on the profile page where "viewing someone else" doesn't mean fully read-only.
  const structureResponse = {
    ok: true,
    json: async () => ({
      structure: {
        id: 's1',
        wageType: 'fixed',
        monthlyWage: 50000,
        yearlyWage: 600000,
        workingDaysPerWeek: 5,
        breakTimeHours: 1,
        components: [
          { id: 'c1', name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 50, description: null, displayOrder: 1, amount: 25000 },
        ],
        grossSalary: 25000,
        totalDeductions: 0,
        employerContributions: 0,
        netSalary: 25000,
      },
    }),
  };

  {
    // Employee viewing own salary: read-only, no Edit button.
    const renderer = await mountWithFetch(async () => structureResponse, 'employee', { employeeId: 'u1', isOwnProfile: true, viewerRole: 'employee' });
    const markup = JSON.stringify(renderer.toJSON());
    if (markup.includes('"Edit"')) fail('Employee viewing own salary must not see an Edit button');
    if (!markup.includes('25000') && !markup.includes('25,000.00')) fail('Structure figures should render for the owner');
    await act(async () => renderer.unmount());
  }
  {
    // Admin viewing SOMEONE ELSE's salary: still editable — the D-03 divergence from the rest
    // of the profile page's view-only-for-others rule.
    const renderer = await mountWithFetch(async () => structureResponse, 'admin_hr', { employeeId: 'u2', isOwnProfile: false, viewerRole: 'admin_hr' });
    const editButtons = renderer.root.findAllByType('button').filter((b) => b.children.includes('Edit'));
    if (editButtons.length === 0) {
      fail("D-03: Admin viewing another employee's salary should still see an Edit button (diverges from the rest of the profile page)");
    }
    await act(async () => renderer.unmount());
  }

  // 3. SalaryComponentsEditor — only one component may be flagged Basic; selecting a new one
  // clears the previous flag rather than allowing two.
  {
    let currentComponents = [
      { name: 'Basic', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 50, description: '', displayOrder: 1 },
      { name: 'HRA', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, description: '', displayOrder: 2 },
    ];
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(SalaryComponentsEditor, {
          components: currentComponents,
          onChange: (next) => {
            currentComponents = next;
          },
        })
      );
    });
    const radios = renderer.root.findAllByProps({ name: 'salary-is-basic' });
    if (radios.length !== 2) fail(`expected 2 Basic radios, found ${radios.length}`);
    await act(async () => {
      radios[1].props.onChange({});
    });
    if (currentComponents[0].isBasic !== false || currentComponents[1].isBasic !== true) {
      fail('Selecting a new Basic radio should clear the previous selection, not allow two');
    }
    await act(async () => renderer.unmount());
  }
} finally {
  await server.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('[smoke-payroll] PASS: Salary Info tab D-03 edit boundary, empty state, and components editor behave correctly');
