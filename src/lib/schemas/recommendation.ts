import { z } from 'zod';

// ---------------------------------------------------------------------------
// BriefSchema
// ---------------------------------------------------------------------------
// NOTE: `description` is required here (min 10 chars) even though the `Brief`
// type in @/lib/types has `description?: string`. The recommendation route
// needs a real description to produce useful picks, so the schema is
// intentionally stricter than the base type. `customPosture` and
// `colorsProvided` are included as optional to stay permissive with
// Brief-shaped input.

export const BriefSchema = z.object({
  projectName: z.string().min(1),
  industry: z.string().min(1),
  posture: z.enum(['boutique', 'startup', 'enterprise', 'custom']),
  description: z.string().min(10),
  customPosture: z.string().optional(),
  colorsProvided: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// RankedPickSchema
// ---------------------------------------------------------------------------

export const RankedPickSchema = z.object({
  entryId: z.string().min(1),
  entryName: z.string().min(1),
  confidence: z.number().min(0).max(1),
  // 1200 chars ≈ ~4 long sentences. The system prompt asks for 1–2 sentences
  // around 300 chars, but Haiku's adherence to that soft target drifts on
  // emotional or layered briefs (e.g., "warmth, safety, calm" → ~410 chars).
  // The schema's job is to reject malformed responses, not enforce prose
  // style — so the cap is set generously above the worst observed overshoot,
  // and discipline is left to the system prompt.
  reasoning: z.string().min(10).max(1200),
});

// ---------------------------------------------------------------------------
// RecommendationModelOutputSchema
// ---------------------------------------------------------------------------
// Shape Haiku is instructed to emit (system.md:23 — "The server fills in
// generatedAt and model — do not emit those fields"). The recommendation
// parser validates against THIS schema. Each bucket is capped at 5 to absorb
// model variance; arrays may be empty.

export const RecommendationModelOutputSchema = z.object({
  aesthetics: z.array(RankedPickSchema).max(5),
  layouts: z.array(RankedPickSchema).max(5),
  interactions: z.array(RankedPickSchema).max(5),
  systems: z.array(RankedPickSchema).max(5),
});

// ---------------------------------------------------------------------------
// RecommendationResultSchema
// ---------------------------------------------------------------------------
// The public envelope: model output enriched with server-side metadata.
// `generatedAt` and `model` are filled in by the route handler / CLI after
// the parser has validated the model output.

export const RecommendationResultSchema = RecommendationModelOutputSchema.extend({
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
 * `Brief`, `RankedPick`, `RecommendationResult`, `RecommendationModelOutput`
 * from `@/lib/types` for domain use; reach for these inferred types only when
 * working directly with the Zod schemas (e.g., a parser that returns
 * `z.infer<typeof Schema>`).
 */

export type BriefInput = z.infer<typeof BriefSchema>;
export type RankedPickParsed = z.infer<typeof RankedPickSchema>;
export type RecommendationModelOutputParsed = z.infer<typeof RecommendationModelOutputSchema>;
export type RecommendationResultParsed = z.infer<typeof RecommendationResultSchema>;
