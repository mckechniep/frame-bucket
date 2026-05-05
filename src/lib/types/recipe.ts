import type { TaxonomyEntry } from './taxonomy';

export type Vibe = 'mom-and-pop' | 'scrappy-startup' | 'enterprise' | 'custom';

export interface Brief {
  projectName: string;
  industry: string;
  vibe: Vibe;
  customVibe?: string;
  colorsProvided?: string[];
  description?: string;
}

export interface Recipe {
  brief: Brief;
  aesthetic: TaxonomyEntry;
  layout: TaxonomyEntry;
  interaction?: TaxonomyEntry;
  system?: TaxonomyEntry;
}
