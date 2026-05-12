import { z } from 'zod';
import { RecipeSchema } from './recipe';

// ---------------------------------------------------------------------------
// IterationRequestSchema
// ---------------------------------------------------------------------------
// Mirrors the `IterationRequest` interface from `@/lib/types/iteration.ts`.
// Feedback is bounded 10–1000 chars to enforce concision: feedback longer
// than 1 000 chars is a signal the user wants a full regeneration, not an
// incremental iteration.
//
// `previousHtml` is optional — the route resolves the parent HTML from the
// archive via `previousArtifactId`. Accepting an HTML payload on the wire is
// a token-bomb risk; we keep the field optional for the `iterate.ts` CLI
// path that still passes it explicitly, but the wizard never sends it.

export const IterationRequestSchema = z.object({
  recipe: RecipeSchema,
  previousHtml: z.string().optional(),
  previousArtifactId: z.string().min(1),
  feedback: z.string().min(10).max(1000),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
/**
 * Inferred type from `IterationRequestSchema`. Suffixed `Input` to avoid
 * colliding with the explicit `IterationRequest` interface when both are
 * imported in the same module. Prefer importing `IterationRequest` from
 * `@/lib/types` for domain use; use this when working directly with the
 * Zod schema (e.g., a parser that returns `z.infer<typeof Schema>`).
 */
export type IterationRequestInput = z.infer<typeof IterationRequestSchema>;
