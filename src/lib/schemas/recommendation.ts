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

export type BriefInput = z.infer<typeof BriefSchema>;
export type RankedPickParsed = z.infer<typeof RankedPickSchema>;
export type RecommendationResultParsed = z.infer<typeof RecommendationResultSchema>;
