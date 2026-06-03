import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignTokens } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Mock setup
// ──────────────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock('@/lib/anthropic/client', () => ({
  getAnthropicClient: () => ({
    messages: {
      create: mockCreate,
    },
  }),
}));

// Import AFTER the mock is registered
import {
  generateNarrative,
  parseNarrativeSections,
  NARRATIVE_MODEL,
  NARRATIVE_MAX_TOKENS,
} from '../narrative';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

function makeTokens(): DesignTokens {
  return {
    colors: [
      { name: '--color-accent', value: '#c4ff00', note: 'acid lime' },
      { name: '--color-bg', value: '#0a0a0a' },
    ],
    fonts: [{ family: 'Space Grotesk', weights: [400, 700], role: 'body' }],
    typeScale: [{ name: '--fs-h1', value: 'clamp(3rem, 1.8rem + 7vw, 9rem)' }],
    spacing: [{ name: '--space-1', value: '0.25rem' }],
    other: [{ name: '--radius-card', value: '0.5rem' }],
    meta: { extractedFrom: 'artifact-123', recipeSummary: 'cyberpunk-futuristic', fallback: false },
  };
}

const RECIPE = 'cyberpunk-futuristic + full-bleed-landing-page';
const HTML = '<html><body><h1>Test</h1></body></html>';

const FULL_RESPONSE_TEXT = `## Identity
A dark cyberpunk aesthetic with neon accents.

## Rules
1. Never use white backgrounds.
2. Type scale must use clamp() values verbatim.

## Component Patterns
Nav: fixed top with accent border-bottom.
Hero: full-viewport grid overlay.

## How to Extend
Use the color tokens exactly — do not introduce new palette values.`;

function makeMockResponse(text: string, inputTokens = 800, outputTokens = 400) {
  return {
    content: [{ type: 'text', text }],
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: 0,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// parseNarrativeSections — unit tests
// ──────────────────────────────────────────────────────────────────────────────

describe('parseNarrativeSections', () => {
  it('parses all four sections from a standard response', () => {
    const result = parseNarrativeSections(FULL_RESPONSE_TEXT);
    expect(result.identity).toContain('dark cyberpunk');
    expect(result.rules).toContain('Never use white');
    expect(result.componentPatterns).toContain('Nav: fixed top');
    expect(result.howToExtend).toContain('color tokens exactly');
  });

  it('trims leading/trailing whitespace from each section', () => {
    const result = parseNarrativeSections(FULL_RESPONSE_TEXT);
    expect(result.identity).toBe(result.identity.trim());
    expect(result.rules).toBe(result.rules.trim());
    expect(result.componentPatterns).toBe(result.componentPatterns.trim());
    expect(result.howToExtend).toBe(result.howToExtend.trim());
  });

  it('missing sections → empty string for that field', () => {
    const partial = `## Identity
Just identity here.`;
    const result = parseNarrativeSections(partial);
    expect(result.identity).toContain('Just identity here');
    expect(result.rules).toBe('');
    expect(result.componentPatterns).toBe('');
    expect(result.howToExtend).toBe('');
  });

  it('out-of-order sections still parse correctly', () => {
    const reversed = `## How to Extend
Extend guidance here.

## Component Patterns
Component info here.

## Rules
Rule set here.

## Identity
Identity block here.`;
    const result = parseNarrativeSections(reversed);
    expect(result.identity).toContain('Identity block here');
    expect(result.rules).toContain('Rule set here');
    expect(result.componentPatterns).toContain('Component info here');
    expect(result.howToExtend).toContain('Extend guidance here');
  });

  it('empty string → all fields empty, no throw', () => {
    const result = parseNarrativeSections('');
    expect(result.identity).toBe('');
    expect(result.rules).toBe('');
    expect(result.componentPatterns).toBe('');
    expect(result.howToExtend).toBe('');
  });

  it('headings with extra trailing whitespace still parse', () => {
    const text = `## Identity
Identity with trailing whitespace on heading.

## Rules
Rules with trailing whitespace.`;
    const result = parseNarrativeSections(text);
    expect(result.identity).toContain('Identity with trailing whitespace');
    expect(result.rules).toContain('Rules with trailing whitespace');
  });

  it('section content does not bleed into the next section', () => {
    const result = parseNarrativeSections(FULL_RESPONSE_TEXT);
    // Identity should not contain Rules content
    expect(result.identity).not.toContain('Never use white');
    // Rules should not contain Component Patterns content
    expect(result.rules).not.toContain('Nav: fixed top');
  });

  it('## Identity inside a fenced code block in How-to-Extend does NOT corrupt the real Identity section', () => {
    const text = `## Identity
A dark cyberpunk aesthetic.

## Rules
1. Never use white backgrounds.

## Component Patterns
Nav: fixed top.

## How to Extend
When adding new tokens, structure them like this:

\`\`\`
## Identity
--color-new: #ff0000; /* example snippet */
\`\`\`

See token conventions above.`;
    const result = parseNarrativeSections(text);
    // Real Identity section must be the genuine prose, not the snippet
    expect(result.identity).toBe('A dark cyberpunk aesthetic.');
    // How-to-Extend must still contain its code block and surrounding prose
    expect(result.howToExtend).toContain('When adding new tokens');
    expect(result.howToExtend).toContain('See token conventions above');
  });

  // Intentional strictness: only bare ## H2 headings trigger section splits.
  // ### H3 and **bold-wrapped** headings do not match — acknowledged graceful-degradation cases.
  it('### Identity (H3) does NOT match — section comes back empty (graceful degradation)', () => {
    const text = `### Identity
This is under an H3 heading, not H2.`;
    const result = parseNarrativeSections(text);
    expect(result.identity).toBe('');
  });

  it('**## Identity** (bold-wrapped) does NOT match — section comes back empty (graceful degradation)', () => {
    const text = `**## Identity**
This heading is bold-wrapped.`;
    const result = parseNarrativeSections(text);
    expect(result.identity).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

describe('narrative constants', () => {
  it('NARRATIVE_MODEL is claude-haiku-4-5', () => {
    expect(NARRATIVE_MODEL).toBe('claude-haiku-4-5');
  });

  it('NARRATIVE_MAX_TOKENS is 2048', () => {
    expect(NARRATIVE_MAX_TOKENS).toBe(2048);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// generateNarrative — happy path
// ──────────────────────────────────────────────────────────────────────────────

describe('generateNarrative — happy path', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue(makeMockResponse(FULL_RESPONSE_TEXT));
  });

  it('returns all four narrative fields populated', async () => {
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.narrative.identity).toContain('dark cyberpunk');
    expect(result.narrative.rules).toContain('Never use white');
    expect(result.narrative.componentPatterns).toContain('Nav: fixed top');
    expect(result.narrative.howToExtend).toContain('color tokens exactly');
  });

  it('returns modelId as claude-haiku-4-5', async () => {
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.modelId).toBe('claude-haiku-4-5');
  });

  it('returns cost > 0 for non-trivial usage', async () => {
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('calls messages.create with correct model', async () => {
    await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5' }),
      expect.anything(),
    );
  });

  it('calls messages.create with max_tokens 2048', async () => {
    await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 }),
      expect.anything(),
    );
  });

  it('passes an AbortSignal in the options', async () => {
    await generateNarrative(makeTokens(), HTML, RECIPE);
    const [, options] = mockCreate.mock.calls[0] as [unknown, { signal?: AbortSignal }];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes maxRetries: 0 in the options to disable SDK retry loops', async () => {
    await generateNarrative(makeTokens(), HTML, RECIPE);
    const [, options] = mockCreate.mock.calls[0] as [unknown, { maxRetries?: number }];
    expect(options?.maxRetries).toBe(0);
  });

  it('cost is computed from usage tokens', async () => {
    // 800 input + 400 output at haiku rates: 800*1/1e6 + 400*5/1e6 = 0.000800 + 0.002000 = 0.0028
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.cost).toBeCloseTo(0.0028, 5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// generateNarrative — missing sections
// ──────────────────────────────────────────────────────────────────────────────

describe('generateNarrative — partial response', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('missing Rules/ComponentPatterns/HowToExtend → those fields empty, identity populated', async () => {
    mockCreate.mockResolvedValueOnce(
      makeMockResponse(`## Identity
Only identity was returned.`),
    );
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.narrative.identity).toContain('Only identity was returned');
    expect(result.narrative.rules).toBe('');
    expect(result.narrative.componentPatterns).toBe('');
    expect(result.narrative.howToExtend).toBe('');
  });

  it('out-of-order sections in response parse correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeMockResponse(`## How to Extend
Extend here.

## Rules
Rules here.

## Component Patterns
Patterns here.

## Identity
Identity here.`),
    );
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.narrative.identity).toContain('Identity here');
    expect(result.narrative.rules).toContain('Rules here');
    expect(result.narrative.componentPatterns).toContain('Patterns here');
    expect(result.narrative.howToExtend).toContain('Extend here');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// generateNarrative — error handling (Rule 9: never throw, never block)
// ──────────────────────────────────────────────────────────────────────────────

describe('generateNarrative — API error fallback', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('API rejection → returns all-empty narrative, no throw', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API unavailable'));
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.narrative.identity).toBe('');
    expect(result.narrative.rules).toBe('');
    expect(result.narrative.componentPatterns).toBe('');
    expect(result.narrative.howToExtend).toBe('');
    expect(result.cost).toBe(0);
  });

  it('API error → returns cost 0', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'));
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.cost).toBe(0);
  });

  it('API error → modelId is still claude-haiku-4-5', async () => {
    mockCreate.mockRejectedValueOnce(new Error('500 Internal'));
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.modelId).toBe('claude-haiku-4-5');
  });

  it('API error → console.error called with expected prefix', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCreate.mockRejectedValueOnce(new Error('Test error'));
    await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[contract-narrative]'),
      expect.anything(),
    );
  });
});

describe('generateNarrative — timeout fallback', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('AbortError (timeout) → returns all-empty narrative, no throw', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    mockCreate.mockRejectedValueOnce(abortError);
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.narrative.identity).toBe('');
    expect(result.narrative.rules).toBe('');
    expect(result.cost).toBe(0);
  });

  it('AbortError → console.error called', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    mockCreate.mockRejectedValueOnce(abortError);
    await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(consoleError).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// generateNarrative — edge: response with no text block
// ──────────────────────────────────────────────────────────────────────────────

describe('generateNarrative — empty/malformed response', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('response with no text content block → returns empty narrative, no throw', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
      usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0 },
    });
    const result = await generateNarrative(makeTokens(), HTML, RECIPE);
    expect(result.narrative.identity).toBe('');
    expect(result.narrative.rules).toBe('');
    expect(result.cost).toBe(0);
  });
});
