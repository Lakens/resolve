import { spawn } from 'node:child_process';

const executablePath = process.argv[2];

if (!executablePath) {
  console.error('Usage: node scripts/electron-smoke.mjs <path-to-executable>');
  process.exit(1);
}

const child = spawn(executablePath, [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    QUARTOREVIEW_SMOKE_TEST: '1',
  },
});

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
  console.error(`Timed out waiting for smoke test app to exit: ${executablePath}`);
  process.exit(1);
}, 30000);

child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (signal) {
    console.error(`Smoke test app exited via signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
