import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { assembleContract } from '../assemble';
import { extractTokens } from '../extract-tokens';
import type { DesignTokens, ContractNarrative } from '../types';

const FIXTURE_PATH = join(import.meta.dirname, 'fixtures/cyberpunk-artifact.html');
const fixture = readFileSync(FIXTURE_PATH, 'utf-8');

// ──────────────────────────────────────────────────────────────────────────────
// Shared test data
// ──────────────────────────────────────────────────────────────────────────────

const SITE_NAME = 'SmokeYard';
const RECIPE = 'cyberpunk-futuristic + full-bleed-landing-page';
const ARTIFACT_ID = 'test-artifact';

function realTokens(): DesignTokens {
  return extractTokens(fixture, RECIPE, ARTIFACT_ID);
}

function fullNarrative(): ContractNarrative {
  return {
    identity:
      'A dark, neon-charged cyberpunk aesthetic with acid lime and magenta as primary signals.',
    rules: '1. Never use white backgrounds.\n2. Type scale must use clamp() values verbatim.',
    componentPatterns:
      'Nav: fixed top, `--color-surface` bg, accent border-bottom on scroll.\nHero: full-viewport with grid overlay.',
    howToExtend: 'Use the color tokens exactly — do not introduce new palette values.',
  };
}

function emptyNarrative(): ContractNarrative {
  return { identity: '', rules: '', componentPatterns: '', howToExtend: '' };
}

const EMPTY_TOKENS: DesignTokens = {
  colors: [],
  fonts: [],
  typeScale: [],
  spacing: [],
  other: [],
  meta: { extractedFrom: 'inline', recipeSummary: 'none', fallback: false },
};

// ──────────────────────────────────────────────────────────────────────────────
// contractMd
// ──────────────────────────────────────────────────────────────────────────────

describe('assembleContract — contractMd', () => {
  it('contains the correct H1 title', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(contractMd).toContain(`# Design Contract — ${SITE_NAME}`);
  });

  it('sections appear in the specified order', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const identityIdx = contractMd.indexOf('## Identity');
    const colorIdx = contractMd.indexOf('## Color Tokens');
    const typoIdx = contractMd.indexOf('## Typography');
    const spacingIdx = contractMd.indexOf('## Spacing');
    const rulesIdx = contractMd.indexOf('## Rules');
    const patternsIdx = contractMd.indexOf('## Component Patterns');
    const extendIdx = contractMd.indexOf('## How to Extend This Site');

    expect(identityIdx).toBeGreaterThan(-1);
    expect(colorIdx).toBeGreaterThan(identityIdx);
    expect(typoIdx).toBeGreaterThan(colorIdx);
    expect(spacingIdx).toBeGreaterThan(typoIdx);
    expect(rulesIdx).toBeGreaterThan(spacingIdx);
    expect(patternsIdx).toBeGreaterThan(rulesIdx);
    expect(extendIdx).toBeGreaterThan(patternsIdx);
  });

  it('## Other tokens section appears between Spacing and Rules when non-empty', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const spacingIdx = contractMd.indexOf('## Spacing');
    const otherIdx = contractMd.indexOf('## Other tokens');
    const rulesIdx = contractMd.indexOf('## Rules');

    expect(otherIdx).toBeGreaterThan(spacingIdx);
    expect(rulesIdx).toBeGreaterThan(otherIdx);
  });

  it('color table has correct header row', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(contractMd).toContain('| Name | Value | Note |');
  });

  it('Rule 7: every color VALUE from DesignTokens appears verbatim in contractMd', () => {
    const tokens = realTokens();
    const { contractMd } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    for (const color of tokens.colors) {
      expect(contractMd).toContain(color.value);
    }
  });

  it('color table contains --color-accent with value #c4ff00', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(contractMd).toContain('#c4ff00');
    expect(contractMd).toContain('--color-accent');
  });

  it('includes "Use these exact values" instruction after color table', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(contractMd).toMatch(/use these exact values/i);
  });

  it('typography section includes font family table with correct headers', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(contractMd).toContain('| Family | Role | Weights | Source |');
  });

  it('typography section includes type scale subsection', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(contractMd).toContain('Type scale');
    // clamp values in backticks
    expect(contractMd).toContain('`clamp(3rem, 1.8rem + 7vw, 9rem)`');
  });

  it('spacing section includes token table', () => {
    const { contractMd } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(contractMd).toContain('--space-1');
    expect(contractMd).toContain('0.25rem');
  });

  it('renders identity from narrative', () => {
    const narrative = fullNarrative();
    const { contractMd } = assembleContract(realTokens(), narrative, SITE_NAME);
    expect(contractMd).toContain(narrative.identity);
  });

  it('empty identity → renders placeholder', () => {
    const { contractMd } = assembleContract(realTokens(), emptyNarrative(), SITE_NAME);
    expect(contractMd).toContain('_(derived tokens only');
  });

  it('renders rules from narrative', () => {
    const narrative = fullNarrative();
    const { contractMd } = assembleContract(realTokens(), narrative, SITE_NAME);
    expect(contractMd).toContain(narrative.rules);
  });

  it('renders componentPatterns from narrative', () => {
    const narrative = fullNarrative();
    const { contractMd } = assembleContract(realTokens(), narrative, SITE_NAME);
    expect(contractMd).toContain(narrative.componentPatterns);
  });

  it('renders howToExtend from narrative when provided', () => {
    const narrative = fullNarrative();
    const { contractMd } = assembleContract(realTokens(), narrative, SITE_NAME);
    expect(contractMd).toContain(narrative.howToExtend);
  });

  it('empty howToExtend → renders default instruction block mentioning AI assistant', () => {
    const { contractMd } = assembleContract(realTokens(), emptyNarrative(), SITE_NAME);
    expect(contractMd).toMatch(/paste this entire document/i);
    expect(contractMd).toMatch(/ai assistant/i);
  });

  it('## Other tokens section is omitted when other array is empty', () => {
    const tokens = { ...EMPTY_TOKENS, colors: [{ name: '--color-bg', value: '#000' }] };
    const { contractMd } = assembleContract(tokens, fullNarrative(), 'X');
    expect(contractMd).not.toContain('## Other tokens');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// tokensJson
// ──────────────────────────────────────────────────────────────────────────────

describe('assembleContract — tokensJson', () => {
  it('round-trips through JSON.parse without error', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(() => JSON.parse(tokensJson)).not.toThrow();
  });

  it('is pretty-printed (2-space indent)', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const parsed = JSON.parse(tokensJson);
    expect(JSON.stringify(parsed, null, 2)).toBe(tokensJson);
  });

  it('nested by category: color, font, scale, space, other', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const obj = JSON.parse(tokensJson) as Record<string, unknown>;
    expect(obj).toHaveProperty('color');
    expect(obj).toHaveProperty('font');
    expect(obj).toHaveProperty('scale');
    expect(obj).toHaveProperty('space');
    expect(obj).toHaveProperty('other');
  });

  it('--color-accent key is prefix-stripped to "accent" with value #c4ff00', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const obj = JSON.parse(tokensJson) as { color: Record<string, { value: string }> };
    expect(obj.color['accent']).toBeDefined();
    expect(obj.color['accent']?.value).toBe('#c4ff00');
  });

  it('color note is preserved when present', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const obj = JSON.parse(tokensJson) as {
      color: Record<string, { value: string; note?: string }>;
    };
    expect(obj.color['accent']?.note).toMatch(/acid lime/i);
  });

  it('color without note has no note property', () => {
    const tokens: DesignTokens = {
      ...EMPTY_TOKENS,
      colors: [{ name: '--color-bg', value: '#000000' }],
    };
    const { tokensJson } = assembleContract(tokens, fullNarrative(), 'X');
    const obj = JSON.parse(tokensJson) as { color: Record<string, { note?: string }> };
    const key = Object.keys(obj.color)[0]!;
    expect(obj.color[key]).not.toHaveProperty('note');
  });

  it('type scale keys are prefix-stripped (--fs-h1 → h1)', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const obj = JSON.parse(tokensJson) as { scale: Record<string, { value: string }> };
    expect(obj.scale['h1']).toBeDefined();
    expect(obj.scale['h1']?.value).toBe('clamp(3rem, 1.8rem + 7vw, 9rem)');
  });

  it('spacing keys are prefix-stripped (--space-1 → 1)', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const obj = JSON.parse(tokensJson) as { space: Record<string, { value: string }> };
    expect(obj.space['1']).toBeDefined();
    expect(obj.space['1']?.value).toBe('0.25rem');
  });

  it('font keys use role when unique, else family slug', () => {
    const { tokensJson } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const obj = JSON.parse(tokensJson) as { font: Record<string, { family: string }> };
    // display, body, mono roles should all be present as keys
    expect(obj.font['display']).toBeDefined();
    expect(obj.font['body']).toBeDefined();
    expect(obj.font['mono']).toBeDefined();
  });

  it('empty everything → valid object with empty-ish categories', () => {
    const { tokensJson } = assembleContract(EMPTY_TOKENS, emptyNarrative(), 'Empty Site');
    const obj = JSON.parse(tokensJson) as Record<string, unknown>;
    expect(obj).toHaveProperty('color');
    expect(obj).toHaveProperty('font');
    expect(typeof obj['color']).toBe('object');
  });

  it('key collision: --color-accent and --accent both survive with distinct keys and values', () => {
    // --color-accent strips to "accent" (desired), --accent also strips to "accent" (collision)
    // buildUniqueKey falls back to toFamilySlug("accent") = "accent" (also taken),
    // then appends a counter → "accent-2"
    const tokens: DesignTokens = {
      ...EMPTY_TOKENS,
      colors: [
        { name: '--color-accent', value: '#111' },
        { name: '--accent', value: '#222' },
      ],
    };
    const { tokensJson } = assembleContract(tokens, emptyNarrative(), 'X');
    const obj = JSON.parse(tokensJson) as { color: Record<string, { value: string }> };
    // First color gets the desired key "accent"
    expect(obj.color['accent']).toBeDefined();
    expect(obj.color['accent']?.value).toBe('#111');
    // Second color gets the collision-resolved key "accent-2"
    expect(obj.color['accent-2']).toBeDefined();
    expect(obj.color['accent-2']?.value).toBe('#222');
    // Both values are present and distinct
    const values = Object.values(obj.color).map((c) => c.value);
    expect(values).toContain('#111');
    expect(values).toContain('#222');
    expect(new Set(values).size).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// tokensCss
// ──────────────────────────────────────────────────────────────────────────────

describe('assembleContract — tokensCss', () => {
  it('starts with :root {', () => {
    const { tokensCss } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    expect(tokensCss).toMatch(/:root\s*\{/);
  });

  it('is a balanced CSS block (equal { and })', () => {
    const { tokensCss } = assembleContract(realTokens(), fullNarrative(), SITE_NAME);
    const opens = (tokensCss.match(/\{/g) ?? []).length;
    const closes = (tokensCss.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('contains every color custom property name from the input', () => {
    const tokens = realTokens();
    const { tokensCss } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    for (const color of tokens.colors) {
      expect(tokensCss).toContain(color.name);
    }
  });

  it('contains every typeScale custom property name from the input', () => {
    const tokens = realTokens();
    const { tokensCss } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    for (const ts of tokens.typeScale) {
      expect(tokensCss).toContain(ts.name);
    }
  });

  it('contains every spacing custom property name from the input', () => {
    const tokens = realTokens();
    const { tokensCss } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    for (const sp of tokens.spacing) {
      expect(tokensCss).toContain(sp.name);
    }
  });

  it('contains every other custom property name from the input', () => {
    const tokens = realTokens();
    const { tokensCss } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    for (const o of tokens.other) {
      expect(tokensCss).toContain(o.name);
    }
  });

  it('color with note renders as /* note */ comment', () => {
    const tokens: DesignTokens = {
      ...EMPTY_TOKENS,
      colors: [{ name: '--color-accent', value: '#c4ff00', note: 'acid lime' }],
    };
    const { tokensCss } = assembleContract(tokens, emptyNarrative(), 'X');
    expect(tokensCss).toContain('/* acid lime */');
  });

  it('has section comments /* Colors */, /* Type scale */, /* Spacing */', () => {
    const tokens = realTokens();
    const { tokensCss } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    expect(tokensCss).toContain('/* Colors */');
    expect(tokensCss).toContain('/* Type scale */');
    expect(tokensCss).toContain('/* Spacing */');
  });

  it('/* Other */ section comment present when other is non-empty', () => {
    const tokens = realTokens();
    const { tokensCss } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    // The fixture has other tokens (--font-*, --lh-*, --ease-*, etc.)
    expect(tokensCss).toContain('/* Other */');
  });

  it('output uses original full custom property names (not stripped)', () => {
    const tokens: DesignTokens = {
      ...EMPTY_TOKENS,
      colors: [{ name: '--color-void', value: '#050507' }],
    };
    const { tokensCss } = assembleContract(tokens, emptyNarrative(), 'X');
    expect(tokensCss).toContain('--color-void: #050507;');
  });

  it('empty everything → produces :root {} with no throw', () => {
    expect(() => assembleContract(EMPTY_TOKENS, emptyNarrative(), 'Empty Site')).not.toThrow();
    const { tokensCss } = assembleContract(EMPTY_TOKENS, emptyNarrative(), 'Empty Site');
    expect(tokensCss).toMatch(/:root\s*\{/);
    expect(tokensCss).toContain('}');
  });

  it('section order: Colors before Type scale before Spacing before Other', () => {
    const tokens = realTokens();
    const { tokensCss } = assembleContract(tokens, fullNarrative(), SITE_NAME);
    const colorsIdx = tokensCss.indexOf('/* Colors */');
    const scaleIdx = tokensCss.indexOf('/* Type scale */');
    const spacingIdx = tokensCss.indexOf('/* Spacing */');
    const otherIdx = tokensCss.indexOf('/* Other */');
    expect(colorsIdx).toBeLessThan(scaleIdx);
    expect(scaleIdx).toBeLessThan(spacingIdx);
    expect(spacingIdx).toBeLessThan(otherIdx);
  });

  it('CSS injection: note containing */ is neutralized and cannot escape the comment', () => {
    const tokens: DesignTokens = {
      ...EMPTY_TOKENS,
      colors: [{ name: '--color-evil', value: '#f00', note: 'ok */ color: red; /*' }],
    };
    const { tokensCss } = assembleContract(tokens, emptyNarrative(), 'X');
    // The unescaped sequence must not appear — it would close the comment and inject CSS
    expect(tokensCss).not.toContain('*/ color: red');
    // The comment must still be present (sanitized form — */ replaced with * /)
    expect(tokensCss).toContain('/* ok * / color: red; /* */');
  });

  it('md table: note containing | is escaped as \\| in the rendered table', () => {
    const tokens: DesignTokens = {
      ...EMPTY_TOKENS,
      colors: [{ name: '--color-split', value: '#abc', note: 'left|right' }],
    };
    const { contractMd } = assembleContract(tokens, emptyNarrative(), 'X');
    // The pipe inside the note must be escaped so it doesn't break the table column
    expect(contractMd).toContain('left\\|right');
    // The raw unescaped pipe (as a column separator at that position) must NOT appear
    // i.e. no four-column row where the note cell breaks into two cells
    const noteLine = contractMd.split('\n').find((l) => l.includes('--color-split'));
    expect(noteLine).toBeDefined();
    // A properly escaped row has exactly 4 pipes (| name | value | note |)
    const pipeCount = (noteLine!.match(/(?<!\\)\|/g) ?? []).length;
    expect(pipeCount).toBe(4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Happy-path integration — real fixture tokens, full narrative
// ──────────────────────────────────────────────────────────────────────────────

describe('assembleContract — integration (real fixture)', () => {
  it('all three outputs are non-empty strings', () => {
    const { contractMd, tokensJson, tokensCss } = assembleContract(
      realTokens(),
      fullNarrative(),
      SITE_NAME,
    );
    expect(typeof contractMd).toBe('string');
    expect(contractMd.length).toBeGreaterThan(200);
    expect(typeof tokensJson).toBe('string');
    expect(tokensJson.length).toBeGreaterThan(100);
    expect(typeof tokensCss).toBe('string');
    expect(tokensCss.length).toBeGreaterThan(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Edge case: empty-everything
// ──────────────────────────────────────────────────────────────────────────────

describe('assembleContract — empty-everything edge case', () => {
  it('assembleContract({empty}, {empty}, "Empty Site") produces valid md, json, css without throw', () => {
    expect(() => assembleContract(EMPTY_TOKENS, emptyNarrative(), 'Empty Site')).not.toThrow();
  });

  it('contractMd has title and default how-to-extend block', () => {
    const { contractMd } = assembleContract(EMPTY_TOKENS, emptyNarrative(), 'Empty Site');
    expect(contractMd).toContain('# Design Contract — Empty Site');
    expect(contractMd).toMatch(/paste this entire document/i);
  });

  it('tokensJson parses to object with all category keys present', () => {
    const { tokensJson } = assembleContract(EMPTY_TOKENS, emptyNarrative(), 'Empty Site');
    const obj = JSON.parse(tokensJson) as Record<string, unknown>;
    expect(obj).toHaveProperty('color');
    expect(obj).toHaveProperty('font');
    expect(obj).toHaveProperty('scale');
    expect(obj).toHaveProperty('space');
    expect(obj).toHaveProperty('other');
  });

  it('tokensCss is valid (balanced braces, no throw)', () => {
    const { tokensCss } = assembleContract(EMPTY_TOKENS, emptyNarrative(), 'Empty Site');
    const opens = (tokensCss.match(/\{/g) ?? []).length;
    const closes = (tokensCss.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
