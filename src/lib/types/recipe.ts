import type { TaxonomyEntry } from './taxonomy';

export type Posture = 'boutique' | 'startup' | 'enterprise' | 'custom';

export const POSTURE_DEFINITIONS: Record<
  Exclude<Posture, 'custom'>,
  { label: string; tagline: string }
> = {
  boutique: { label: 'Boutique', tagline: 'Warm, hand-considered, local' },
  startup: { label: 'Startup', tagline: 'Lean, expressive, opinionated' },
  enterprise: { label: 'Enterprise', tagline: 'Calm, restrained, institutional' },
};

export interface Brief {
  projectName: string;
  industry: string;
  posture: Posture;
  customPosture?: string;
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
