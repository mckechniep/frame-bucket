import { describe, it, expect } from 'vitest';
import { buildNarrativePrompt } from '../contract-narrative';
import type { DesignTokens } from '@/lib/contract/types';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

function makeTokens(): DesignTokens {
  return {
    colors: [
      { name: '--color-accent', value: '#c4ff00', note: 'acid lime' },
      { name: '--color-bg', value: '#0a0a0a' },
      { name: '--color-text', value: 'oklch(94% 0.02 250)' },
    ],
    fonts: [
      { family: 'Major Mono Display', weights: [400], role: 'display' },
      { family: 'Space Grotesk', weights: [400, 700], role: 'body' },
    ],
    typeScale: [
      { name: '--fs-h1', value: 'clamp(3rem, 1.8rem + 7vw, 9rem)' },
      { name: '--fs-body', value: '1rem' },
    ],
    spacing: [
      { name: '--space-1', value: '0.25rem' },
      { name: '--space-section', value: 'clamp(4rem, 8vw, 10rem)' },
    ],
    other: [
      { name: '--radius-card', value: '0.5rem' },
      { name: '--ease-out', value: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    ],
    meta: { extractedFrom: 'artifact-123', recipeSummary: 'cyberpunk-futuristic', fallback: false },
  };
}

const RECIPE = 'cyberpunk-futuristic + full-bleed-landing-page';
const SHORT_HTML = '<html><body><h1>Hello</h1></body></html>';

// ──────────────────────────────────────────────────────────────────────────────
// System prompt — Rule 7 boundary enforcement
// ──────────────────────────────────────────────────────────────────────────────

describe('buildNarrativePrompt — system prompt', () => {
  it('contains the "may not invent or alter values" instruction', () => {
    const { system } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    // Rule 7: boundary at the prompt level — model DOCUMENTS only
    expect(system.toLowerCase()).toMatch(/may not invent/);
  });

  it('contains the "alter" restriction', () => {
    const { system } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    expect(system.toLowerCase()).toMatch(/alter/);
  });

  it('instructs model it is DOCUMENTING an existing design system', () => {
    const { system } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    expect(system.toLowerCase()).toMatch(/document/);
  });

  it('specifies that output must have ## Identity heading', () => {
    const { system } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    expect(system).toContain('## Identity');
  });

  it('specifies that output must have ## Rules heading', () => {
    const { system } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    expect(system).toContain('## Rules');
  });

  it('specifies that output must have ## Component Patterns heading', () => {
    const { system } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    expect(system).toContain('## Component Patterns');
  });

  it('specifies that output must have ## How to Extend heading', () => {
    const { system } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    expect(system).toContain('## How to Extend');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// User prompt — content requirements
// ──────────────────────────────────────────────────────────────────────────────

describe('buildNarrativePrompt — user prompt', () => {
  it('contains the recipeSummary', () => {
    const { user } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    expect(user).toContain(RECIPE);
  });

  it('contains color token values', () => {
    const tokens = makeTokens();
    const { user } = buildNarrativePrompt(tokens, SHORT_HTML, RECIPE);
    for (const color of tokens.colors) {
      expect(user, `missing color value ${color.value}`).toContain(color.value);
    }
  });

  it('contains color token names', () => {
    const tokens = makeTokens();
    const { user } = buildNarrativePrompt(tokens, SHORT_HTML, RECIPE);
    for (const color of tokens.colors) {
      expect(user, `missing color name ${color.name}`).toContain(color.name);
    }
  });

  it('contains typeScale values', () => {
    const tokens = makeTokens();
    const { user } = buildNarrativePrompt(tokens, SHORT_HTML, RECIPE);
    for (const ts of tokens.typeScale) {
      expect(user, `missing typeScale value ${ts.value}`).toContain(ts.value);
    }
  });

  it('contains spacing values', () => {
    const tokens = makeTokens();
    const { user } = buildNarrativePrompt(tokens, SHORT_HTML, RECIPE);
    for (const sp of tokens.spacing) {
      expect(user, `missing spacing value ${sp.value}`).toContain(sp.value);
    }
  });

  it('contains font family names', () => {
    const tokens = makeTokens();
    const { user } = buildNarrativePrompt(tokens, SHORT_HTML, RECIPE);
    for (const font of tokens.fonts) {
      expect(user, `missing font family ${font.family}`).toContain(font.family);
    }
  });

  it('truncates htmlSource to ≤ 30000 chars when input exceeds 40000 chars', () => {
    const longHtml = 'X'.repeat(40_000);
    const { user } = buildNarrativePrompt(makeTokens(), longHtml, RECIPE);
    // The truncated HTML portion: find where the html starts in user prompt
    // and verify the X-string block is ≤ 30000 + small overhead
    const xChunkMatch = user.match(/X+/);
    expect(xChunkMatch).not.toBeNull();
    expect(xChunkMatch![0].length).toBeLessThanOrEqual(30_000);
  });

  it('does not truncate htmlSource when ≤ 30000 chars', () => {
    const exactHtml = 'A'.repeat(30_000);
    const { user } = buildNarrativePrompt(makeTokens(), exactHtml, RECIPE);
    const aChunkMatch = user.match(/A+/);
    expect(aChunkMatch).not.toBeNull();
    expect(aChunkMatch![0].length).toBe(30_000);
  });

  it('restates the required output structure (four sections)', () => {
    const { user } = buildNarrativePrompt(makeTokens(), SHORT_HTML, RECIPE);
    // The user prompt should remind the model what sections to produce
    expect(user).toContain('## Identity');
    expect(user).toContain('## Rules');
    expect(user).toContain('## Component Patterns');
    expect(user).toContain('## How to Extend');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Rule 7 — input-completeness: every extracted color value present in user prompt
// ──────────────────────────────────────────────────────────────────────────────

describe('buildNarrativePrompt — Rule 7 input-completeness', () => {
  it('every color value from DesignTokens appears in user prompt', () => {
    const tokens = makeTokens();
    const { user } = buildNarrativePrompt(tokens, SHORT_HTML, RECIPE);
    for (const color of tokens.colors) {
      expect(user).toContain(color.value);
    }
  });

  it('empty tokens produces a prompt without throwing', () => {
    const empty: DesignTokens = {
      colors: [],
      fonts: [],
      typeScale: [],
      spacing: [],
      other: [],
      meta: { extractedFrom: 'inline', recipeSummary: '', fallback: false },
    };
    expect(() => buildNarrativePrompt(empty, SHORT_HTML, '')).not.toThrow();
    const { system, user } = buildNarrativePrompt(empty, SHORT_HTML, '');
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });
});
