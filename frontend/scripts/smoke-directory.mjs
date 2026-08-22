/**
 * Employees directory smoke test — Phase 05 (search debounce call-count, NEW button role
 * gating). Same Vite-SSR-loader technique as the other smoke-*.mjs scripts; uses
 * react-test-renderer + act (not renderToStaticMarkup) because this needs real effects and
 * interactive state updates to run — debounce timers and a fetch-on-settle effect.
 */
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`[smoke-directory] FAIL: ${message}`);
  process.exitCode = 1;
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });

try {
  const { MemoryRouter } = await server.ssrLoadModule('react-router-dom');
  const { AuthContext } = await server.ssrLoadModule('/src/app/auth/AuthContext.jsx');
  const { DirectoryPage } = await server.ssrLoadModule('/src/features/employees/DirectoryPage.jsx');

  function withAuth(role, children) {
    const authValue = {
      user: { id: 'u1', role },
      accessToken: 'fake-token',
      setAccessToken: () => {},
      logout: () => {},
    };
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(AuthContext.Provider, { value: authValue }, children)
    );
  }

  // 1. "NEW" button role gating — static check, no effects/fetch needed (renderToStaticMarkup
  // never runs DirectoryPage's data-fetch effect, so this only inspects the initial render shape).
  const employeeMarkup = renderToStaticMarkup(withAuth('employee', React.createElement(DirectoryPage)));
  if (employeeMarkup.includes('+ NEW')) {
    fail('The "NEW" button must not render for an employee-role viewer');
  }
  const adminMarkup = renderToStaticMarkup(withAuth('admin_hr', React.createElement(DirectoryPage)));
  if (!adminMarkup.includes('+ NEW')) {
    fail('The "NEW" button must render for an admin_hr-role viewer');
  }

  // 2. Search debounce — fetch should fire once on mount, then NOT once per keystroke, then
  // exactly once more after the debounce window elapses.
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCallCount += 1;
    return { ok: true, json: async () => ({ employees: [], page: 1, pageSize: 20, total: 0 }) };
  };

  let renderer;
  try {
    await act(async () => {
      renderer = create(withAuth('employee', React.createElement(DirectoryPage)));
    });
    // Let the initial (empty-search) mount effect settle.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const afterInitialLoad = fetchCallCount;
    if (afterInitialLoad < 1) {
      fail('expected at least one fetch call on initial mount');
    }

    const searchInput = renderer.root.findByProps({ type: 'search' });
    for (const value of ['a', 'al', 'ali', 'alic', 'alice']) {
      await act(async () => {
        searchInput.props.onChange({ target: { value } });
      });
    }
    const rightAfterTyping = fetchCallCount;
    if (rightAfterTyping !== afterInitialLoad) {
      fail(
        `typing must not fire a fetch per keystroke; call count grew from ${afterInitialLoad} to ${rightAfterTyping} before the debounce window elapsed`
      );
    }

    // SEARCH_DEBOUNCE_MS is 300ms in DirectoryPage.jsx — wait past it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    const afterDebounce = fetchCallCount;
    if (afterDebounce !== afterInitialLoad + 1) {
      fail(
        `expected exactly one additional fetch after the debounce settles, got ${afterDebounce - afterInitialLoad}`
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) {
      await act(async () => {
        renderer.unmount();
      });
    }
  }
} finally {
  await server.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('[smoke-directory] PASS: search debounce fires once per settle, NEW button is role-gated');
