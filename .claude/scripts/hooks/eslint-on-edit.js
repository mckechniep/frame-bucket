#!/usr/bin/env node
/**
 * PostToolUse: run `pnpm exec eslint --fix` on the file just edited.
 *
 * Complements the global stop-format-typecheck hook (which handles
 * Prettier + tsc but not ESLint). Auto-fix only — never blocks.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const LINT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const TIMEOUT_MS = 30_000;

let raw = '';
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const file = input?.tool_input?.file_path;
  if (!file || typeof file !== 'string') process.exit(0);
  if (!LINT_EXTS.has(path.extname(file))) process.exit(0);

  const cwd = input.cwd || process.cwd();
  const result = spawnSync(
    'pnpm',
    ['exec', 'eslint', '--fix', '--no-error-on-unmatched-pattern', file],
    { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: TIMEOUT_MS },
  );

  // Surface remaining lint output to Claude without blocking.
  if (result.status !== 0) {
    const tail = (result.stderr?.toString() || result.stdout?.toString() || '').slice(-1000);
    if (tail.trim()) process.stderr.write(`[eslint] ${tail}\n`);
  }
  process.exit(0);
});
