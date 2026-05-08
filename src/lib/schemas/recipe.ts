import { z } from 'zod';
import { TaxonomyEntrySchema } from './taxonomy';
import { BriefSchema } from './recommendation';

// ---------------------------------------------------------------------------
// RecipeSchema
// ---------------------------------------------------------------------------
// Mirrors the `Recipe` interface from `@/lib/types/recipe.ts`. Optional
// fields (interaction, system) match the type — a recipe may omit them when
// the brief doesn't call for those dimensions.

export const RecipeSchema = z.object({
  brief: BriefSchema,
  aesthetic: TaxonomyEntrySchema,
  layout: TaxonomyEntrySchema,
  interaction: TaxonomyEntrySchema.optional(),
  system: TaxonomyEntrySchema.optional(),
});

export type RecipeParsed = z.infer<typeof RecipeSchema>;
