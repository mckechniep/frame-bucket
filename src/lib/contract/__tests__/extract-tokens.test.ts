import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { extractTokens } from '../extract-tokens';

const FIXTURE_PATH = join(import.meta.dirname, 'fixtures/cyberpunk-artifact.html');
const fixture = readFileSync(FIXTURE_PATH, 'utf-8');

// ──────────────────────────────────────────────────────────────────────────────
// Colors
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — colors', () => {
  it('extracts at least 5 color tokens', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    expect(result.colors.length).toBeGreaterThanOrEqual(5);
  });

  it('extracts --color-accent with value #c4ff00 and note containing "acid lime"', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const accent = result.colors.find((c) => c.name === '--color-accent');
    expect(accent).toBeDefined();
    expect(accent?.value).toBe('#c4ff00');
    expect(accent?.note).toMatch(/acid lime/i);
  });

  it('Rule 7: every extracted color value appears verbatim in the fixture source', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    for (const token of result.colors) {
      expect(fixture, `${token.name}: "${token.value}" not found verbatim`).toContain(token.value);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Fonts
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — fonts', () => {
  it('extracts 3 font families', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    expect(result.fonts.length).toBe(3);
  });

  it('identifies Major Mono Display as display role', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const f = result.fonts.find((f) => f.family === 'Major Mono Display');
    expect(f).toBeDefined();
    expect(f?.role).toBe('display');
  });

  it('identifies JetBrains Mono as mono role with weights [400, 500, 700]', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const f = result.fonts.find((f) => f.family === 'JetBrains Mono');
    expect(f).toBeDefined();
    expect(f?.role).toBe('mono');
    expect(f?.weights).toEqual([400, 500, 700]);
  });

  it('identifies Space Grotesk as body role with weights [400, 500, 700]', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const f = result.fonts.find((f) => f.family === 'Space Grotesk');
    expect(f).toBeDefined();
    expect(f?.role).toBe('body');
    expect(f?.weights).toEqual([400, 500, 700]);
  });

  it('stores the Google Fonts href as source', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const f = result.fonts.find((f) => f.family === 'JetBrains Mono');
    expect(f?.source).toMatch(/fonts\.googleapis\.com/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Type scale
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — typeScale', () => {
  it('extracts --fs-* tokens', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const names = result.typeScale.map((t) => t.name);
    expect(names).toContain('--fs-micro');
    expect(names).toContain('--fs-h1');
  });

  it('preserves clamp() values verbatim', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const h1 = result.typeScale.find((t) => t.name === '--fs-h1');
    expect(h1?.value).toBe('clamp(3rem, 1.8rem + 7vw, 9rem)');

    const micro = result.typeScale.find((t) => t.name === '--fs-micro');
    expect(micro?.value).toBe('clamp(0.6875rem, 0.65rem + 0.15vw, 0.75rem)');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Spacing
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — spacing', () => {
  it('extracts --space-* tokens', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const names = result.spacing.map((t) => t.name);
    expect(names).toContain('--space-1');
    expect(names).toContain('--space-8');
    expect(names).toContain('--space-section');
  });

  it('extracts --gutter as spacing', () => {
    const result = extractTokens(fixture, 'cyberpunk test');
    const names = result.spacing.map((t) => t.name);
    expect(names).toContain('--gutter');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Meta
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — meta', () => {
  it('sets recipeSummary from argument', () => {
    const result = extractTokens(fixture, 'my summary');
    expect(result.meta.recipeSummary).toBe('my summary');
  });

  it('sets extractedFrom to provided value', () => {
    const result = extractTokens(fixture, 'summary', 'artifact-123');
    expect(result.meta.extractedFrom).toBe('artifact-123');
  });

  it('defaults extractedFrom to "inline" when not provided', () => {
    const result = extractTokens(fixture, 'summary');
    expect(result.meta.extractedFrom).toBe('inline');
  });

  it('sets fallback to false', () => {
    const result = extractTokens(fixture, 'summary');
    expect(result.meta.fallback).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// other bucket — CSS reproduction guarantee
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — other bucket', () => {
  it('--font-display declaration appears in result.other (CSS reproduction guarantee)', () => {
    const html = `
      <html><head><style>
        :root {
          --font-display: 'Major Mono Display', monospace;
          --color-bg: #0a0a0a;
        }
      </style></head><body></body></html>
    `;
    const result = extractTokens(html, 'test');
    const fontDecl = result.other.find((o) => o.name === '--font-display');
    expect(fontDecl).toBeDefined();
    expect(fontDecl?.value).toContain('Major Mono Display');
  });

  it('multi-line custom property value is parsed correctly and lands in other', () => {
    const html = `
      <html><head><style>
        :root {
          --shadow-card: 0 2px 4px rgba(0,0,0,0.1),
            0 8px 16px rgba(0,0,0,0.2);
        }
      </style></head><body></body></html>
    `;
    const result = extractTokens(html, 'test');
    const shadow = result.other.find((o) => o.name === '--shadow-card');
    expect(shadow).toBeDefined();
    // Full value should contain both shadow layers
    expect(shadow?.value).toContain('0 2px 4px');
    expect(shadow?.value).toContain('0 8px 16px');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// color-mix() classification
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — color-mix recognition', () => {
  it('color-mix() value classifies as a color token', () => {
    const html = `
      <html><head><style>
        :root {
          --color-overlay: color-mix(in oklch, #000 30%, transparent);
        }
      </style></head><body></body></html>
    `;
    const result = extractTokens(html, 'test');
    const overlay = result.colors.find((c) => c.name === '--color-overlay');
    expect(overlay).toBeDefined();
    expect(overlay?.value).toContain('color-mix');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Edge cases — never throws
// ──────────────────────────────────────────────────────────────────────────────
describe('extractTokens — edge cases', () => {
  it(':root-less HTML → all arrays empty, no throw', () => {
    const html = '<html><body>hi</body></html>';
    expect(() => extractTokens(html, 'test')).not.toThrow();
    const result = extractTokens(html, 'test');
    expect(result.colors).toHaveLength(0);
    expect(result.fonts).toHaveLength(0);
    expect(result.typeScale).toHaveLength(0);
    expect(result.spacing).toHaveLength(0);
    expect(result.other).toHaveLength(0);
  });

  it('empty string input → empty result, no throw', () => {
    expect(() => extractTokens('', 'test')).not.toThrow();
    const result = extractTokens('', 'test');
    expect(result.colors).toHaveLength(0);
    expect(result.fonts).toHaveLength(0);
  });

  it('@media nested around :root → still parses the right block', () => {
    const html = `
      <html><head><style>
        @media (prefers-color-scheme: dark) {
          :root {
            --color-bg: #111111;
            --space-sm: 0.5rem;
            --fs-title: clamp(1rem, 2vw, 3rem);
          }
        }
      </style></head><body></body></html>
    `;
    const result = extractTokens(html, 'test');
    expect(result.colors.find((c) => c.name === '--color-bg')).toBeDefined();
    expect(result.spacing.find((s) => s.name === '--space-sm')).toBeDefined();
    expect(result.typeScale.find((t) => t.name === '--fs-title')).toBeDefined();
  });

  it(':root with nested @media inside → parses outer :root declarations', () => {
    const html = `
      <html><head><style>
        :root {
          --color-primary: #ff0000;
          --space-base: 1rem;
        }
        @media (min-width: 768px) {
          :root {
            --space-base: 1.5rem;
          }
        }
      </style></head><body></body></html>
    `;
    const result = extractTokens(html, 'test');
    // Should find at least the first :root's color
    expect(result.colors.find((c) => c.name === '--color-primary')).toBeDefined();
  });
});
