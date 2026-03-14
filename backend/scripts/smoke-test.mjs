import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForJson(url, predicate, timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        if (predicate(payload)) {
          return payload;
        }
      }
    } catch (_) {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'quartoreview-backend-smoke-'));
const backendEnvPath = path.join(tmpRoot, '.env');
const sessionDir = path.join(tmpRoot, 'sessions');
const frontendDistDir = path.resolve(process.cwd(), '../frontend/dist');
const port = await getFreePort();
const healthToken = `smoke-${Date.now()}`;

assert.ok(existsSync(path.join(frontendDistDir, 'index.html')), 'Expected frontend/dist/index.html to exist');

writeFileSync(backendEnvPath, 'SESSION_SECRET=smoke-secret\n', 'utf8');

const child = spawn(process.execPath, ['index.js'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_MODE: 'desktop',
    PORT: String(port),
    FRONTEND_DIST: frontendDistDir,
    BACKEND_ENV_PATH: backendEnvPath,
    SESSION_DIR: sessionDir,
    BACKEND_HEALTH_TOKEN: healthToken,
  },
});

try {
  const health = await waitForJson(
    `http://127.0.0.1:${port}/health`,
    (payload) => payload.ok && payload.launchToken === healthToken
  );
  assert.equal(health.desktopMode, true);

  const authStatus = await waitForJson(
    `http://127.0.0.1:${port}/api/auth/check`,
    (payload) => typeof payload.authenticated === 'boolean'
  );
  assert.equal(authStatus.desktopMode, true);
} finally {
  child.kill('SIGTERM');
  rmSync(tmpRoot, { recursive: true, force: true });
}
