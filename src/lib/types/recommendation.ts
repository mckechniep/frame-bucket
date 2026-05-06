import type { Brief } from './recipe';

export type { Brief };

export interface RankedPick {
  entryId: string;
  entryName: string;
  /** 0–1 confidence score from the model */
  confidence: number;
  reasoning: string;
}

/**
 * Result of a recommendation call against the taxonomy.
 * `aesthetics` and `layouts` are always populated.
 * `interactions` and `systems` are optional in v1 — returned as empty arrays
 * unless the brief signals the need for them.
 */
export interface RecommendationResult {
  aesthetics: RankedPick[];
  layouts: RankedPick[];
  interactions?: RankedPick[];
  systems?: RankedPick[];
  /** ISO-8601 timestamp produced by the server when the result was generated */
  generatedAt: string;
  /** Model identifier used for the recommendation (e.g. "claude-sonnet-4-6") */
  model: string;
}
