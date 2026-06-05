import type { DesignTokens, ContractNarrative } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Sanitization helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Sanitize a value for safe inclusion in a GFM table cell. */
function mdCell(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/** Sanitize a note for safe inclusion in a CSS block comment (the kind delimited by slash-star). */
function cssComment(note: string): string {
  // Replace the comment-close sequence with a visually-equivalent broken form.
  // Using '* /' (space-separated) prevents comment terminator injection.
  return note.replace(/\*\//g, '* /').replace(/\r?\n/g, ' ').trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────────

export interface AssembledContract {
  contractMd: string;
  tokensJson: string;
  tokensCss: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pure renderer — no IO, no LLM, no async.
 * Turns extracted DesignTokens + a ContractNarrative into the three
 * deliverable files that make up a design contract.
 *
 * Rule 7: token VALUES in the output MUST come from the DesignTokens input,
 * never fabricated. The narrative provides PROSE only.
 */
export function assembleContract(
  tokens: DesignTokens,
  narrative: ContractNarrative,
  siteName: string,
): AssembledContract {
  return {
    contractMd: renderContractMd(tokens, narrative, siteName),
    tokensJson: renderTokensJson(tokens),
    tokensCss: renderTokensCss(tokens),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// contract.md renderer
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_HOW_TO_EXTEND = `Paste this entire document into an AI assistant (Claude, ChatGPT, Cursor) and describe the page you want — for example: "Build me an About page following this design contract exactly." The assistant has everything it needs: the exact color, type, and spacing tokens above, plus the rules and component patterns. For best results, ask it to reuse the CSS custom properties verbatim.`;

const DEFAULT_RULES_PLACEHOLDER = `_(No rules captured — paste this contract into an AI assistant and ask it to infer sensible rules from the tokens above.)_`;

const DEFAULT_PATTERNS_PLACEHOLDER = `_(No component patterns captured — paste this contract into an AI assistant and describe the components you need.)_`;

// NOTE: Narrative prose (identity, rules, componentPatterns, howToExtend) is
// inserted verbatim and is trusted as well-formed markdown from the controlled
// Task-7 LLM pipeline. Only TABLE CELL values (tokens + notes) are sanitized
// via mdCell(), because a broken table corrupts the machine-readable token set.
function renderContractMd(
  tokens: DesignTokens,
  narrative: ContractNarrative,
  siteName: string,
): string {
  const sections: string[] = [];

  // 1. Title
  sections.push(`# Design Contract — ${siteName}`);
  sections.push('');

  // 2. Identity
  sections.push('## Identity');
  sections.push('');
  sections.push(narrative.identity.trim() || '_(derived tokens only — narrative unavailable)_');
  sections.push('');

  // 3. Color Tokens
  sections.push('## Color Tokens');
  sections.push('');
  if (tokens.colors.length > 0) {
    sections.push('| Name | Value | Note |');
    sections.push('| --- | --- | --- |');
    for (const color of tokens.colors) {
      const note = color.note ?? '';
      sections.push(`| ${mdCell(color.name)} | ${mdCell(color.value)} | ${mdCell(note)} |`);
    }
  } else {
    sections.push('_(no color tokens found)_');
  }
  sections.push('');
  sections.push('Use these exact values — do not introduce new colors.');
  sections.push('');

  // 4. Typography
  sections.push('## Typography');
  sections.push('');
  if (tokens.fonts.length > 0) {
    sections.push('| Family | Role | Weights | Source |');
    sections.push('| --- | --- | --- | --- |');
    for (const font of tokens.fonts) {
      const weights = font.weights.join(', ');
      const source = font.source ?? '';
      sections.push(
        `| ${mdCell(font.family)} | ${mdCell(font.role)} | ${mdCell(weights)} | ${mdCell(source)} |`,
      );
    }
  } else {
    sections.push('_(no font tokens found)_');
  }
  sections.push('');

  // Type scale subsection
  sections.push('### Type scale');
  sections.push('');
  if (tokens.typeScale.length > 0) {
    sections.push('| Name | Value |');
    sections.push('| --- | --- |');
    for (const ts of tokens.typeScale) {
      sections.push(`| ${mdCell(ts.name)} | \`${mdCell(ts.value)}\` |`);
    }
  } else {
    sections.push('_(no type scale tokens found)_');
  }
  sections.push('');

  // 5. Spacing
  sections.push('## Spacing');
  sections.push('');
  if (tokens.spacing.length > 0) {
    sections.push('| Name | Value |');
    sections.push('| --- | --- |');
    for (const sp of tokens.spacing) {
      sections.push(`| ${mdCell(sp.name)} | ${mdCell(sp.value)} |`);
    }
  } else {
    sections.push('_(no spacing tokens found)_');
  }
  sections.push('');

  // 6. Other tokens (only when non-empty)
  if (tokens.other.length > 0) {
    sections.push('## Other tokens');
    sections.push('');
    sections.push('| Name | Value |');
    sections.push('| --- | --- |');
    for (const o of tokens.other) {
      sections.push(`| ${mdCell(o.name)} | ${mdCell(o.value)} |`);
    }
    sections.push('');
  }

  // 7. Rules
  sections.push('## Rules');
  sections.push('');
  sections.push(narrative.rules.trim() || DEFAULT_RULES_PLACEHOLDER);
  sections.push('');

  // 8. Component Patterns
  sections.push('## Component Patterns');
  sections.push('');
  sections.push(narrative.componentPatterns.trim() || DEFAULT_PATTERNS_PLACEHOLDER);
  sections.push('');

  // 9. How to Extend
  sections.push('## How to Extend This Site');
  sections.push('');
  sections.push(narrative.howToExtend.trim() || DEFAULT_HOW_TO_EXTEND);
  sections.push('');

  return sections.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// tokens.json renderer
// ──────────────────────────────────────────────────────────────────────────────

/** Strip common CSS custom property prefixes and return a clean key. */
function stripColorPrefix(name: string): string {
  // Try progressively shorter prefixes
  for (const prefix of ['--color-', '--c-', '--']) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length);
      if (stripped.length > 0) return stripped;
    }
  }
  return name;
}

function stripScalePrefix(name: string): string {
  for (const prefix of ['--fs-', '--text-', '--font-size-', '--']) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length);
      if (stripped.length > 0) return stripped;
    }
  }
  return name;
}

function stripSpacePrefix(name: string): string {
  for (const prefix of ['--space-', '--gap-', '--gutter-', '--']) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length);
      if (stripped.length > 0) return stripped;
    }
  }
  return name;
}

function stripOtherPrefix(name: string): string {
  if (name.startsWith('--')) return name.slice(2);
  return name;
}

/** Build a unique key, falling back to a slug when there's a collision. */
function buildUniqueKey(desiredKey: string, seen: Set<string>, fallbackSlug: string): string {
  if (!seen.has(desiredKey)) {
    seen.add(desiredKey);
    return desiredKey;
  }
  // Try the fallback
  if (!seen.has(fallbackSlug)) {
    seen.add(fallbackSlug);
    return fallbackSlug;
  }
  // Last resort: append a counter
  let n = 2;
  while (seen.has(`${fallbackSlug}-${n}`)) n++;
  const key = `${fallbackSlug}-${n}`;
  seen.add(key);
  return key;
}

function toFamilySlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function renderTokensJson(tokens: DesignTokens): string {
  // ── Colors ──
  const colorObj: Record<string, { value: string; note?: string }> = {};
  const colorKeySeen = new Set<string>();

  for (const color of tokens.colors) {
    const desired = stripColorPrefix(color.name);
    const fallback = toFamilySlug(color.name.replace(/^--/, ''));
    const key = buildUniqueKey(desired, colorKeySeen, fallback);
    colorObj[key] = { value: color.value, ...(color.note ? { note: color.note } : {}) };
  }

  // ── Fonts ──
  // Multiple fonts can share role 'other' — in that case key by family slug.
  const fontObj: Record<
    string,
    { family: string; weights: number[]; role: string; source?: string }
  > = {};
  const fontKeySeen = new Set<string>();
  // Track role counts to detect duplication
  const roleCounts: Record<string, number> = {};
  for (const font of tokens.fonts) {
    roleCounts[font.role] = (roleCounts[font.role] ?? 0) + 1;
  }

  for (const font of tokens.fonts) {
    const roleUnique = (roleCounts[font.role] ?? 0) === 1;
    const desired = roleUnique ? font.role : toFamilySlug(font.family);
    const fallback = toFamilySlug(font.family);
    const key = buildUniqueKey(desired, fontKeySeen, fallback);
    fontObj[key] = {
      family: font.family,
      weights: font.weights,
      role: font.role,
      ...(font.source ? { source: font.source } : {}),
    };
  }

  // ── Type scale ──
  const scaleObj: Record<string, { value: string }> = {};
  const scaleKeySeen = new Set<string>();

  for (const ts of tokens.typeScale) {
    const desired = stripScalePrefix(ts.name);
    const fallback = toFamilySlug(ts.name.replace(/^--/, ''));
    const key = buildUniqueKey(desired, scaleKeySeen, fallback);
    scaleObj[key] = { value: ts.value };
  }

  // ── Spacing ──
  const spaceObj: Record<string, { value: string }> = {};
  const spaceKeySeen = new Set<string>();

  for (const sp of tokens.spacing) {
    const desired = stripSpacePrefix(sp.name);
    const fallback = toFamilySlug(sp.name.replace(/^--/, ''));
    const key = buildUniqueKey(desired, spaceKeySeen, fallback);
    spaceObj[key] = { value: sp.value };
  }

  // ── Other ──
  const otherObj: Record<string, { value: string }> = {};
  const otherKeySeen = new Set<string>();

  for (const o of tokens.other) {
    const desired = stripOtherPrefix(o.name);
    const fallback = toFamilySlug(o.name.replace(/^--/, ''));
    const key = buildUniqueKey(desired, otherKeySeen, fallback);
    otherObj[key] = { value: o.value };
  }

  const result = {
    color: colorObj,
    font: fontObj,
    scale: scaleObj,
    space: spaceObj,
    other: otherObj,
  };

  return JSON.stringify(result, null, 2);
}

// ──────────────────────────────────────────────────────────────────────────────
// tokens.css renderer
// ──────────────────────────────────────────────────────────────────────────────

function renderTokensCss(tokens: DesignTokens): string {
  const lines: string[] = [];
  lines.push(':root {');

  // Colors
  if (tokens.colors.length > 0) {
    lines.push('  /* Colors */');
    for (const color of tokens.colors) {
      const comment = color.note ? ` /* ${cssComment(color.note)} */` : '';
      lines.push(`  ${color.name}: ${color.value};${comment}`);
    }
  }

  // Type scale
  if (tokens.typeScale.length > 0) {
    if (tokens.colors.length > 0) lines.push('');
    lines.push('  /* Type scale */');
    for (const ts of tokens.typeScale) {
      lines.push(`  ${ts.name}: ${ts.value};`);
    }
  }

  // Spacing
  if (tokens.spacing.length > 0) {
    if (tokens.colors.length > 0 || tokens.typeScale.length > 0) lines.push('');
    lines.push('  /* Spacing */');
    for (const sp of tokens.spacing) {
      lines.push(`  ${sp.name}: ${sp.value};`);
    }
  }

  // Other
  if (tokens.other.length > 0) {
    if (tokens.colors.length > 0 || tokens.typeScale.length > 0 || tokens.spacing.length > 0) {
      lines.push('');
    }
    lines.push('  /* Other */');
    for (const o of tokens.other) {
      lines.push(`  ${o.name}: ${o.value};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}
