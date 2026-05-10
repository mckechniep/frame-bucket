import { describe, it, expect } from 'vitest';
import type { RankedPick, RecommendationModelOutput, RecommendationResult } from '@/lib/types';
import type { z } from 'zod';
import {
  BriefSchema,
  RankedPickSchema,
  RecommendationModelOutputSchema,
  RecommendationResultSchema,
} from '../recommendation';

// ---------------------------------------------------------------------------
// Type-level structural tests (compile-time only — no runtime cost)
// ---------------------------------------------------------------------------
// RankedPick, RecommendationModelOutput, and RecommendationResult should be
// structurally identical to their schema-inferred counterparts. If these
// assignments fail to compile, the types have diverged.
//
// NOTE: Brief → BriefSchema-inferred is intentionally NOT tested here.
// BriefSchema makes `description` required (min 10) while the `Brief` type
// has `description?: string`. This deliberate divergence means
//   `{} as Brief` cannot be assigned to `z.infer<typeof BriefSchema>`
// because `string | undefined` is not assignable to `string`.

type _RankedPickCheck =
  z.infer<typeof RankedPickSchema> extends RankedPick
    ? RankedPick extends z.infer<typeof RankedPickSchema>
      ? true
      : never
    : never;

type _ModelOutputCheck =
  z.infer<typeof RecommendationModelOutputSchema> extends RecommendationModelOutput
    ? RecommendationModelOutput extends z.infer<typeof RecommendationModelOutputSchema>
      ? true
      : never
    : never;

type _ResultCheck =
  z.infer<typeof RecommendationResultSchema> extends RecommendationResult
    ? RecommendationResult extends z.infer<typeof RecommendationResultSchema>
      ? true
      : never
    : never;

// These const assertions will cause a TS error if the types diverge.
const _pickOk: _RankedPickCheck = true;
const _modelOutputOk: _ModelOutputCheck = true;
const _resultOk: _ResultCheck = true;

// Suppress "declared but never read" warnings.
void _pickOk;
void _modelOutputOk;
void _resultOk;

// ---------------------------------------------------------------------------
// BriefSchema tests
// ---------------------------------------------------------------------------

describe('BriefSchema', () => {
  it('parses a valid brief', () => {
    const input = {
      projectName: 'Brew & Bloom',
      industry: 'Coffee shop',
      vibe: 'mom-and-pop' as const,
      description: 'A warm neighbourhood café celebrating local artisans.',
    };
    expect(BriefSchema.parse(input)).toEqual(input);
  });

  it('parses a brief with optional fields', () => {
    const input = {
      projectName: 'TechCorp',
      industry: 'SaaS',
      vibe: 'enterprise' as const,
      description: 'An enterprise-grade workflow automation platform.',
      customVibe: 'Polished and authoritative',
      colorsProvided: ['#0A2540', '#635BFF'],
    };
    expect(BriefSchema.parse(input)).toEqual(input);
  });

  it('rejects a brief with an empty projectName', () => {
    expect(() =>
      BriefSchema.parse({
        projectName: '',
        industry: 'Retail',
        vibe: 'scrappy-startup',
        description: 'A scrappy online marketplace.',
      }),
    ).toThrow();
  });

  it('rejects a brief with a description shorter than 10 chars', () => {
    expect(() =>
      BriefSchema.parse({
        projectName: 'TinyShop',
        industry: 'Retail',
        vibe: 'scrappy-startup',
        description: 'Short',
      }),
    ).toThrow();
  });

  it('rejects a brief with an invalid vibe value', () => {
    expect(() =>
      BriefSchema.parse({
        projectName: 'TestCo',
        industry: 'Tech',
        vibe: 'hipster',
        description: 'A test project description long enough.',
      }),
    ).toThrow();
  });
});

const validPick: RankedPick = {
  entryId: 'editorial',
  entryName: 'Editorial',
  confidence: 0.92,
  reasoning: 'Strong type-led hierarchy matches the brand storytelling direction.',
};

// ---------------------------------------------------------------------------
// RecommendationModelOutputSchema tests
// ---------------------------------------------------------------------------
// Validates the bare model-output shape — no generatedAt/model. This is what
// Haiku is told to emit and what the parser validates against.

describe('RecommendationModelOutputSchema', () => {
  it('parses a valid model output with no metadata fields', () => {
    const input: RecommendationModelOutput = {
      aesthetics: [validPick],
      layouts: [{ ...validPick, entryId: 'bento', entryName: 'Bento' }],
      interactions: [],
      systems: [],
    };
    expect(RecommendationModelOutputSchema.parse(input)).toEqual(input);
  });

  it('rejects a model output missing a bucket', () => {
    expect(() =>
      RecommendationModelOutputSchema.parse({
        aesthetics: [validPick],
        layouts: [],
        interactions: [],
        // systems intentionally absent
      }),
    ).toThrow();
  });

  it('rejects a model output with unexpected metadata fields treated as required', () => {
    // generatedAt/model in the model-output schema would fail .strict()-style
    // checks if applied; this schema is intentionally non-strict (extra keys
    // ignored), which mirrors Zod default behavior. The check here is that
    // the schema does NOT require those fields.
    const input = {
      aesthetics: [validPick],
      layouts: [],
      interactions: [],
      systems: [],
      // No generatedAt, no model — should still parse cleanly.
    };
    expect(() => RecommendationModelOutputSchema.parse(input)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RecommendationResultSchema tests
// ---------------------------------------------------------------------------

describe('RecommendationResultSchema', () => {
  it('parses a valid recommendation result', () => {
    const input: RecommendationResult = {
      aesthetics: [validPick],
      layouts: [{ ...validPick, entryId: 'bento', entryName: 'Bento' }],
      interactions: [],
      systems: [],
      generatedAt: '2026-05-05T12:00:00.000Z',
      model: 'claude-haiku-4-5',
    };
    expect(RecommendationResultSchema.parse(input)).toEqual(input);
  });

  it('rejects a result where confidence exceeds 1', () => {
    const badPick = { ...validPick, confidence: 1.1 };
    expect(() =>
      RecommendationResultSchema.parse({
        aesthetics: [badPick],
        layouts: [],
        interactions: [],
        systems: [],
        generatedAt: '2026-05-05T12:00:00.000Z',
        model: 'claude-haiku-4-5',
      }),
    ).toThrow();
  });

  it('rejects a result where confidence is below 0', () => {
    const badPick = { ...validPick, confidence: -0.1 };
    expect(() =>
      RecommendationResultSchema.parse({
        aesthetics: [badPick],
        layouts: [],
        interactions: [],
        systems: [],
        generatedAt: '2026-05-05T12:00:00.000Z',
        model: 'claude-haiku-4-5',
      }),
    ).toThrow();
  });

  it('rejects a result with an empty reasoning string', () => {
    const badPick = { ...validPick, reasoning: '' };
    expect(() =>
      RecommendationResultSchema.parse({
        aesthetics: [badPick],
        layouts: [],
        interactions: [],
        systems: [],
        generatedAt: '2026-05-05T12:00:00.000Z',
        model: 'claude-haiku-4-5',
      }),
    ).toThrow();
  });

  it('rejects a result with reasoning exceeding 300 chars', () => {
    const longReasoning = 'A'.repeat(301);
    const badPick = { ...validPick, reasoning: longReasoning };
    expect(() =>
      RecommendationResultSchema.parse({
        aesthetics: [badPick],
        layouts: [],
        interactions: [],
        systems: [],
        generatedAt: '2026-05-05T12:00:00.000Z',
        model: 'claude-haiku-4-5',
      }),
    ).toThrow();
  });

  it('rejects a result with more than 5 picks in a bucket', () => {
    const sixPicks = Array.from({ length: 6 }, (_, i) => ({
      ...validPick,
      entryId: `entry-${i}`,
      entryName: `Entry ${i}`,
    }));
    expect(() =>
      RecommendationResultSchema.parse({
        aesthetics: sixPicks,
        layouts: [],
        interactions: [],
        systems: [],
        generatedAt: '2026-05-05T12:00:00.000Z',
        model: 'claude-haiku-4-5',
      }),
    ).toThrow();
  });

  it('rejects a result with a non-ISO-8601 generatedAt', () => {
    expect(() =>
      RecommendationResultSchema.parse({
        aesthetics: [],
        layouts: [],
        interactions: [],
        systems: [],
        generatedAt: 'not-a-date',
        model: 'claude-haiku-4-5',
      }),
    ).toThrow();
  });
});
