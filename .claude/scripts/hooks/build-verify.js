#!/usr/bin/env node
/**
 * Stop hook: run `pnpm build` to verify the production build still
 * compiles before ending the session. Failures are surfaced via stderr
 * so Claude can react in the next turn.
 *
 * Set CLAUDE_SKIP_BUILD=1 to disable for a session (e.g. docs-only work).
 */
'use strict';

const { spawnSync } = require('child_process');

const TIMEOUT_MS = 180_000;

if (process.env.CLAUDE_SKIP_BUILD === '1') process.exit(0);

const result = spawnSync('pnpm', ['build'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: TIMEOUT_MS,
});

if (result.error?.code === 'ETIMEDOUT') {
  process.stderr.write(`[build-verify] timed out after ${TIMEOUT_MS / 1000}s — skipped\n`);
  process.exit(0);
}

if (result.status !== 0) {
  const stdout = result.stdout?.toString() || '';
  const stderr = result.stderr?.toString() || '';
  process.stderr.write('[build-verify] pnpm build FAILED:\n');
  if (stdout) process.stderr.write(stdout.slice(-2000) + '\n');
  if (stderr) process.stderr.write(stderr.slice(-2000) + '\n');
  process.exit(1);
}
process.exit(0);
