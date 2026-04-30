export type Bucket = 'aesthetic' | 'layout' | 'interaction' | 'system';

export interface TaxonomyEntry {
  id: string;
  bucket: Bucket;
  name: string;
  shortDefinition: string;
  coreMood: string;
  bestUseCase: string;
  distinctiveSignals: string[];
  notes: string;
  notionId: string;
  hasOverride: boolean;
}

export interface Taxonomy {
  syncedAt: string;
  syncedBy: string;
  schemaVersion: number;
  aesthetics: TaxonomyEntry[];
  layouts: TaxonomyEntry[];
  interactions: TaxonomyEntry[];
  systems: TaxonomyEntry[];
}

export const TAXONOMY_SCHEMA_VERSION = 1;
