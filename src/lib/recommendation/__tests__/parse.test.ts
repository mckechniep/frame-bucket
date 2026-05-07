import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRecommendationResponse, RecommendationParseError } from '../parse';
import type { Taxonomy, TaxonomyEntry } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(id: string, bucket: TaxonomyEntry['bucket']): TaxonomyEntry {
  return {
    id,
    bucket,
    name: `Entry ${id}`,
    shortDefinition: 'A short definition',
    coreMood: 'calm',
    bestUseCase: 'General use',
    distinctiveSignals: ['signal-a'],
    notes: '',
    notionId: `notion-${id}`,
    hasOverride: false,
  };
}

const taxonomy: Taxonomy = {
  syncedAt: '2024-01-01T00:00:00Z',
  syncedBy: 'test',
  schemaVersion: 1,
  aesthetics: [makeEntry('aes-1', 'aesthetic'), makeEntry('aes-2', 'aesthetic')],
  layouts: [makeEntry('lay-1', 'layout')],
  interactions: [makeEntry('int-1', 'interaction')],
  systems: [makeEntry('sys-1', 'system')],
};

/** Minimal valid RecommendationResult payload as a plain object */
const validPayload = {
  aesthetics: [
    {
      entryId: 'aes-1',
      entryName: 'Entry aes-1',
      confidence: 0.9,
      reasoning: 'This aesthetic matches the brief well with clear signals.',
    },
  ],
  layouts: [
    {
      entryId: 'lay-1',
      entryName: 'Entry lay-1',
      confidence: 0.8,
      reasoning: 'Layout choice aligns with the content structure described.',
    },
  ],
  interactions: [],
  systems: [],
  generatedAt: '2024-06-01T12:00:00.000Z',
  model: 'claude-haiku-4-5',
};

const validJson = JSON.stringify(validPayload);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseRecommendationResponse', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  // Test 1 — valid JSON parses and entryIds are preserved
  it('parses valid JSON and preserves picks whose entryIds exist in taxonomy', () => {
    const result = parseRecommendationResponse(validJson, taxonomy);

    expect(result.aesthetics).toHaveLength(1);
    expect(result.aesthetics[0]!.entryId).toBe('aes-1');
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0]!.entryId).toBe('lay-1');
    expect(result.interactions).toHaveLength(0);
    expect(result.systems).toHaveLength(0);
    expect(result.model).toBe('claude-haiku-4-5');
    expect(result.generatedAt).toBe('2024-06-01T12:00:00.000Z');
  });

  // Test 2 — markdown ```json fence variant
  it('strips ```json fences before parsing', () => {
    const fenced = `\`\`\`json\n${validJson}\n\`\`\``;
    const result = parseRecommendationResponse(fenced, taxonomy);

    expect(result.aesthetics[0]!.entryId).toBe('aes-1');
    expect(result.layouts[0]!.entryId).toBe('lay-1');
  });

  // Test 2b — bare ``` fence variant
  it('strips bare ``` fences before parsing', () => {
    const fenced = `\`\`\`\n${validJson}\n\`\`\``;
    const result = parseRecommendationResponse(fenced, taxonomy);

    expect(result.aesthetics[0]!.entryId).toBe('aes-1');
  });

  // Test 3 — malformed JSON throws RecommendationParseError
  it('throws RecommendationParseError for malformed JSON', () => {
    // Use a string that starts with '{' so it passes the prefix check but fails JSON.parse
    const malformed = '{ "aesthetics": [broken';
    let caught: unknown;
    try {
      parseRecommendationResponse(malformed, taxonomy);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RecommendationParseError);
    const parseError = caught as RecommendationParseError;
    expect(parseError.name).toBe('RecommendationParseError');
    expect(parseError.rawText).toBe(malformed);
    expect(parseError.cause).toBeDefined();
  });

  // Test 3b — non-JSON text (doesn't start with '{') throws RecommendationParseError
  it('throws RecommendationParseError when stripped text does not start with "{"', () => {
    let caught: unknown;
    try {
      parseRecommendationResponse('Sorry, I cannot help with that.', taxonomy);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RecommendationParseError);
    const parseError = caught as RecommendationParseError;
    expect(parseError.name).toBe('RecommendationParseError');
    expect(parseError.rawText).toBe('Sorry, I cannot help with that.');
  });

  // Test 4 — schema-failing JSON throws RecommendationParseError with Zod issue in cause
  it('throws RecommendationParseError for JSON that fails schema validation', () => {
    // confidence > 1 violates the schema
    const badPayload = {
      ...validPayload,
      aesthetics: [
        {
          entryId: 'aes-1',
          entryName: 'Entry aes-1',
          confidence: 1.5,
          reasoning: 'This is a reasoning sentence that is long enough.',
        },
      ],
    };

    let caught: unknown;
    try {
      parseRecommendationResponse(JSON.stringify(badPayload), taxonomy);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RecommendationParseError);
    const parseError = caught as RecommendationParseError;
    expect(parseError.name).toBe('RecommendationParseError');
    // cause should be the ZodError
    expect(parseError.cause).toBeDefined();
  });

  // Test 4b — missing required field fails schema
  it('throws RecommendationParseError for JSON missing a required field', () => {
    // Omit 'model' to produce a payload that fails schema validation
    const withoutModel = {
      aesthetics: validPayload.aesthetics,
      layouts: validPayload.layouts,
      interactions: validPayload.interactions,
      systems: validPayload.systems,
      generatedAt: validPayload.generatedAt,
      // model intentionally absent
    };

    let caught: unknown;
    try {
      parseRecommendationResponse(JSON.stringify(withoutModel), taxonomy);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RecommendationParseError);
  });

  // Test 5 — invented entryId is dropped, console.warn called, valid picks preserved
  it('drops picks with invented entryIds and warns, preserving valid picks', () => {
    const payloadWithInvented = {
      ...validPayload,
      aesthetics: [
        {
          entryId: 'aes-1',
          entryName: 'Entry aes-1',
          confidence: 0.9,
          reasoning: 'Valid aesthetic pick matching the brief very well.',
        },
        {
          entryId: 'invented-id-xyz',
          entryName: 'Made Up Entry',
          confidence: 0.7,
          reasoning: 'Invented entry that does not exist in the taxonomy.',
        },
      ],
    };

    const result = parseRecommendationResponse(JSON.stringify(payloadWithInvented), taxonomy);

    // Only the valid pick survives
    expect(result.aesthetics).toHaveLength(1);
    expect(result.aesthetics[0]!.entryId).toBe('aes-1');

    // Warn was called for the invented ID
    expect(console.warn).toHaveBeenCalledWith(
      '[recommendation] dropping invalid entryId: invented-id-xyz',
    );
  });

  // Test 6 — empty pick arrays are accepted
  it('accepts a result with all empty pick arrays', () => {
    const emptyPayload = {
      aesthetics: [],
      layouts: [],
      interactions: [],
      systems: [],
      generatedAt: '2024-06-01T12:00:00.000Z',
      model: 'claude-haiku-4-5',
    };

    const result = parseRecommendationResponse(JSON.stringify(emptyPayload), taxonomy);

    expect(result.aesthetics).toHaveLength(0);
    expect(result.layouts).toHaveLength(0);
    expect(result.interactions).toHaveLength(0);
    expect(result.systems).toHaveLength(0);
  });

  // Test 7 — all picks in a bucket are invalid → bucket becomes empty array
  it('leaves a bucket empty when all its picks have invented entryIds', () => {
    const allInvalid = {
      ...validPayload,
      layouts: [
        {
          entryId: 'fake-layout-99',
          entryName: 'Fake Layout',
          confidence: 0.5,
          reasoning: 'Completely fabricated layout that is not in the taxonomy.',
        },
      ],
    };

    const result = parseRecommendationResponse(JSON.stringify(allInvalid), taxonomy);

    expect(result.layouts).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(
      '[recommendation] dropping invalid entryId: fake-layout-99',
    );
    // Other buckets unaffected
    expect(result.aesthetics).toHaveLength(1);
  });

  // Test 8 — leading/trailing whitespace around the JSON is handled
  it('handles leading and trailing whitespace around valid JSON', () => {
    const padded = `   \n  ${validJson}  \n   `;
    const result = parseRecommendationResponse(padded, taxonomy);

    expect(result.aesthetics[0]!.entryId).toBe('aes-1');
  });
});
