/**
 * Recommendation response parser.
 *
 * DESIGN DECISION — "validate, not enrich":
 * The M3 plan's "resolved" semantics were interpreted two ways:
 *   (a) return { entry: TaxonomyEntry, confidence, reasoning } enriched picks
 *   (b) validate that each entryId actually exists in the taxonomy, drop fakes
 *
 * We honour the explicit function signature — return type is `RecommendationResult`
 * (entryId + entryName, not a full TaxonomyEntry). The parser validates that each
 * entryId is real and drops invented ones with a warning. Consumers who need the
 * full TaxonomyEntry look it up via the taxonomy store using the validated entryId.
 */

import { RecommendationResultSchema } from '@/lib/schemas/recommendation';
import type { RecommendationResult } from '@/lib/types';
import type { Taxonomy } from '@/lib/types';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class RecommendationParseError extends Error {
  readonly rawText?: string;

  constructor(message: string, options?: { cause?: unknown; rawText?: string }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'RecommendationParseError';
    this.rawText = options?.rawText;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip leading/trailing markdown code fences that Haiku sometimes wraps JSON in.
 * Handles both ```json\n...\n``` and ```\n...\n``` forms.
 */
function stripFences(text: string): string {
  let stripped = text.trim();
  // Match ```json or ``` opening fence followed by content and closing ```
  const fenceMatch = stripped.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/);
  if (fenceMatch && fenceMatch[1]) {
    stripped = fenceMatch[1].trim();
  }
  return stripped;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const BUCKETS = ['aesthetics', 'layouts', 'interactions', 'systems'] as const;
type BucketKey = (typeof BUCKETS)[number];

/**
 * Parse and validate Haiku's raw JSON response text into a `RecommendationResult`.
 *
 * Steps:
 *  1. Strip markdown code fences.
 *  2. JSON.parse — throws RecommendationParseError on failure.
 *  3. Zod safeParse via RecommendationResultSchema — throws on failure.
 *  4. For each pick in each bucket, verify the entryId exists in the taxonomy.
 *     Picks with invented entryIds are dropped with a console.warn; the rest
 *     of the result is preserved.
 *
 * @throws RecommendationParseError when parsing or schema validation fails.
 */
export function parseRecommendationResponse(
  rawText: string,
  taxonomy: Taxonomy,
): RecommendationResult {
  // Step 1 — strip fences and whitespace
  const stripped = stripFences(rawText);

  if (!stripped.startsWith('{')) {
    throw new RecommendationParseError(
      'Response text does not appear to be JSON (expected leading "{")',
      { rawText },
    );
  }

  // Step 2 — JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new RecommendationParseError('Failed to JSON.parse recommendation response', {
      cause: err,
      rawText,
    });
  }

  // Step 3 — schema validation
  const result = RecommendationResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new RecommendationParseError('Recommendation response failed schema validation', {
      cause: result.error,
      rawText,
    });
  }

  // Step 4 — validate entryIds against taxonomy, drop invented ones
  const validated = result.data;

  // Build lookup sets per bucket for O(1) membership checks
  const taxonomyIds: Record<BucketKey, Set<string>> = {
    aesthetics: new Set(taxonomy.aesthetics.map((e) => e.id)),
    layouts: new Set(taxonomy.layouts.map((e) => e.id)),
    interactions: new Set(taxonomy.interactions.map((e) => e.id)),
    systems: new Set(taxonomy.systems.map((e) => e.id)),
  };

  const filteredBuckets: Pick<RecommendationResult, BucketKey> = {
    aesthetics: [],
    layouts: [],
    interactions: [],
    systems: [],
  };

  for (const bucket of BUCKETS) {
    for (const pick of validated[bucket]) {
      if (taxonomyIds[bucket].has(pick.entryId)) {
        filteredBuckets[bucket].push(pick);
      } else {
        console.warn(`[recommendation] dropping invalid entryId: ${pick.entryId}`);
      }
    }
  }

  return {
    ...validated,
    ...filteredBuckets,
  };
}
