#!/usr/bin/env node
/**
 * PreToolUse: block Write/Edit tool calls that would create a file
 * larger than LIMIT lines. Mirrors the 800-line cap documented in
 * ~/.claude/rules/web/hooks.md.
 *
 * Exit code 2 with stderr message blocks the tool and shows the
 * message to Claude.
 */
'use strict';

const LIMIT = 800;

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

  const content = input?.tool_input?.content ?? input?.tool_input?.new_string;
  if (typeof content !== 'string') process.exit(0);

  const lines = content.split('\n').length;
  if (lines > LIMIT) {
    process.stderr.write(
      `[Hook] BLOCKED: file exceeds ${LIMIT} lines (${lines} lines).\n` +
        `[Hook] Split into smaller modules — see web/coding-style.md.\n`,
    );
    process.exit(2);
  }
  process.exit(0);
});
