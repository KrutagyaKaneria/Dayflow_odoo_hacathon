/**
 * Auth primitives smoke test — Phase 03 (AuthContext, RequireRole, RequireAuth).
 *
 * No component-test framework exists yet in this repo (Vitest/RTL arrives whenever a later
 * phase first needs one) — this uses Vite's own SSR module loader to run the real .jsx source
 * directly in Node (JSX transform included, no browser needed) and react-dom/server to render
 * it, following the same lightweight-smoke-test spirit as scripts/smoke.mjs.
 *
 * None of these primitives are wired into a real route yet — Phase 03 builds them in isolation
 * for Phase 04/05 to import.
 */
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`[smoke-auth] FAIL: ${message}`);
  process.exitCode = 1;
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });

try {
  const { AuthContext, AuthProvider, useAuth, decodeAccessToken } = await server.ssrLoadModule(
    '/src/app/auth/AuthContext.jsx'
  );
  const { RequireRole } = await server.ssrLoadModule('/src/app/auth/RequireRole.jsx');
  const { RequireAuth } = await server.ssrLoadModule('/src/app/auth/RequireAuth.jsx');

  // 1. decodeAccessToken — pure function, no React involved.
  const fakeToken = `${b64url({ alg: 'HS256' })}.${b64url({
    sub: 'user-1',
    role: 'admin_hr',
    organizationId: 'org-1',
  })}.sig`;
  const decoded = decodeAccessToken(fakeToken);
  if (!decoded || decoded.id !== 'user-1' || decoded.role !== 'admin_hr' || decoded.organizationId !== 'org-1') {
    fail(`decodeAccessToken did not decode a well-formed token correctly: ${JSON.stringify(decoded)}`);
  }
  if (decodeAccessToken('not-a-jwt') !== null) {
    fail('decodeAccessToken should return null for garbage input, not throw');
  }

  // Directly supplies a context value (bypassing AuthProvider's storage-reading path) so role
  // scenarios can be exercised without needing a browser/localStorage.
  function withUser(user, children) {
    return React.createElement(
      AuthContext.Provider,
      { value: { user, accessToken: null, setAccessToken: () => {}, logout: () => {} } },
      children
    );
  }

  // 2. RequireRole — non-matching role renders the fallback, matching role renders children.
  const deniedMarkup = renderToStaticMarkup(
    withUser({ id: 'u1', role: 'employee' }, React.createElement(RequireRole, { roles: ['admin_hr'], fallback: 'NOPE' }, 'YES'))
  );
  if (!deniedMarkup.includes('NOPE') || deniedMarkup.includes('YES')) {
    fail(`RequireRole should render the fallback for a non-matching role, got: ${deniedMarkup}`);
  }

  const allowedMarkup = renderToStaticMarkup(
    withUser({ id: 'u1', role: 'admin_hr' }, React.createElement(RequireRole, { roles: ['admin_hr'], fallback: 'NOPE' }, 'YES'))
  );
  if (!allowedMarkup.includes('YES') || allowedMarkup.includes('NOPE')) {
    fail(`RequireRole should render children for a matching role, got: ${allowedMarkup}`);
  }

  // 3. RequireAuth — renders nothing when unauthenticated, renders children when authenticated.
  // The browser redirect itself is a useEffect and does not run under renderToStaticMarkup;
  // that side effect is out of reach for this Node-based smoke test.
  const unauthMarkup = renderToStaticMarkup(withUser(null, React.createElement(RequireAuth, null, 'SECRET')));
  if (unauthMarkup.includes('SECRET')) {
    fail(`RequireAuth should not render children when there is no user, got: ${unauthMarkup}`);
  }

  const authMarkup = renderToStaticMarkup(
    withUser({ id: 'u1', role: 'employee' }, React.createElement(RequireAuth, null, 'SECRET'))
  );
  if (!authMarkup.includes('SECRET')) {
    fail(`RequireAuth should render children when a user is present, got: ${authMarkup}`);
  }

  // 4. AuthProvider — SSR-safe initial state (no window/localStorage in this Node process).
  function Consumer() {
    const { user } = useAuth();
    return React.createElement('span', null, user ? 'HAS_USER' : 'NO_USER');
  }
  const providerMarkup = renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(Consumer)));
  if (!providerMarkup.includes('NO_USER')) {
    fail(`AuthProvider should default to no user when window/localStorage are unavailable, got: ${providerMarkup}`);
  }

  // 5. RequireAuth — Phase 05 now actually relies on the redirect firing (AppShell wraps every
  // authenticated route in it), so this confirms the effect itself runs, not just the static
  // render shape checked above. renderToStaticMarkup never runs effects; react-test-renderer
  // does, so this uses that instead — with a minimal stubbed `window` (Node has none) just
  // sufficient for RequireAuth's single `window.location.assign(...)` call. Kept last: mixing
  // react-test-renderer and react-dom/server against the same context in one process triggers a
  // harmless "multiple renderers" warning if react-dom/server runs afterward — sequencing avoids
  // the noise without changing behavior.
  const assignCalls = [];
  const originalWindow = globalThis.window;
  globalThis.window = { location: { assign: (url) => assignCalls.push(url) } };
  try {
    await act(async () => {
      create(withUser(null, React.createElement(RequireAuth, null, 'SECRET')));
    });
  } finally {
    globalThis.window = originalWindow;
  }
  if (!assignCalls.includes('/signin')) {
    fail(`RequireAuth should redirect to /signin when no user is present, got redirect calls: ${JSON.stringify(assignCalls)}`);
  }
} finally {
  await server.close();
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('[smoke-auth] PASS: AuthContext / RequireRole / RequireAuth behave correctly');
