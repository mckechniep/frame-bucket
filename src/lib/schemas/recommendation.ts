import { z } from 'zod';

// ---------------------------------------------------------------------------
// BriefSchema
// ---------------------------------------------------------------------------
// NOTE: `description` is required here (min 10 chars) even though the `Brief`
// type in @/lib/types has `description?: string`. The recommendation route
// needs a real description to produce useful picks, so the schema is
// intentionally stricter than the base type. `customVibe` and `colorsProvided`
// are included as optional to stay permissive with Brief-shaped input.

export const BriefSchema = z.object({
  projectName: z.string().min(1),
  industry: z.string().min(1),
  vibe: z.enum(['mom-and-pop', 'scrappy-startup', 'enterprise', 'custom']),
  description: z.string().min(10),
  customVibe: z.string().optional(),
  colorsProvided: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// RankedPickSchema
// ---------------------------------------------------------------------------

export const RankedPickSchema = z.object({
  entryId: z.string().min(1),
  entryName: z.string().min(1),
  confidence: z.number().min(0).max(1),
  // 300 chars ≈ 2 tight sentences; enforces the "1–2 sentence" discipline the
  // system prompt (Task 3) will specify. Schema-level enforcement of UX intent.
  reasoning: z.string().min(10).max(300),
});

// ---------------------------------------------------------------------------
// RecommendationResultSchema
// ---------------------------------------------------------------------------
// Each bucket array is capped at 5 to absorb model variance (top 3 expected).
// Arrays may be empty — no `.min(1)` — since interactions/systems are
// validly empty when the brief doesn't signal a need for them.

export const RecommendationResultSchema = z.object({
  aesthetics: z.array(RankedPickSchema).max(5),
  layouts: z.array(RankedPickSchema).max(5),
  interactions: z.array(RankedPickSchema).max(5),
  systems: z.array(RankedPickSchema).max(5),
  generatedAt: z.string().datetime(),
  model: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
/**
 * Inferred types from the schemas above. These are structurally identical to
 * the canonical interfaces in `@/lib/types/recommendation.ts` (the type-level
 * tests in this file's __tests__ prove identity). They use suffixed names
 * (`Input`, `Parsed`) to avoid colliding with the explicit interface names
 * when the schema file needs to import both. Consumers should prefer importing
 * `Brief`, `RankedPick`, `RecommendationResult` from `@/lib/types` for domain
 * use; reach for these inferred types only when working directly with the
 * Zod schemas (e.g., a parser that returns `z.infer<typeof Schema>`).
 */

export type BriefInput = z.infer<typeof BriefSchema>;
export type RankedPickParsed = z.infer<typeof RankedPickSchema>;
export type RecommendationResultParsed = z.infer<typeof RecommendationResultSchema>;
