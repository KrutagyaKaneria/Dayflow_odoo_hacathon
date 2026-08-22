/**
 * Lightweight scaffold smoke test (Phase 01 scope: no components exist yet).
 *
 * Verifies the app shell builds and produces a loadable index.html that
 * references the React entry bundle. Component tests arrive with Phase 02+.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function fail(message) {
  console.error(`[smoke] FAIL: ${message}`);
  process.exit(1);
}

execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });

const distIndex = path.join(root, 'dist', 'index.html');
if (!existsSync(distIndex)) fail('dist/index.html was not produced by the build');

const html = readFileSync(distIndex, 'utf8');
if (!html.includes('<div id="root">')) fail('index.html is missing the #root mount point');
if (!html.includes('type="module"')) fail('index.html does not reference the module bundle');

console.log('[smoke] PASS: frontend scaffold builds and mounts correctly');
