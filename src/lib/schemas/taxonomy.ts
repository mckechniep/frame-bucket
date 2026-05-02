import { z } from 'zod';

export const BucketSchema = z.enum(['aesthetic', 'layout', 'interaction', 'system']);

export const TaxonomyEntrySchema = z.object({
  id: z.string().min(1),
  bucket: BucketSchema,
  name: z.string().min(1),
  shortDefinition: z.string().min(1),
  coreMood: z.string().min(1),
  bestUseCase: z.string().min(1),
  distinctiveSignals: z.array(z.string().min(1)).min(1),
  notes: z.string(),
  notionId: z.string().min(1),
  hasOverride: z.boolean(),
});

export const TaxonomySchema = z.object({
  syncedAt: z.string().datetime(),
  syncedBy: z.string().min(1),
  schemaVersion: z.number().int().min(1),
  aesthetics: z.array(TaxonomyEntrySchema),
  layouts: z.array(TaxonomyEntrySchema),
  interactions: z.array(TaxonomyEntrySchema),
  systems: z.array(TaxonomyEntrySchema),
});

export const NotionPropertiesSchema = z.object({
  name: z.string().min(1),
  shortDefinition: z.string().min(1),
  coreMood: z.string().min(1),
  bestUseCase: z.string().min(1),
  distinctiveSignals: z.array(z.string().min(1)).min(1),
  notes: z.string(),
});

export type NotionProperties = z.infer<typeof NotionPropertiesSchema>;
