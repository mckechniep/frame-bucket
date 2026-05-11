export interface RankedPick {
  entryId: string;
  entryName: string;
  /** 0–1 confidence score from the model */
  confidence: number;
  /** Model-generated free-text rationale tying the pick to the brief. 1–2 sentences. */
  reasoning: string;
}

/**
 * Raw model output shape — exactly what Haiku is instructed to emit.
 * Server metadata (`generatedAt`, `model`) is added downstream to produce a
 * `RecommendationResult`. Splitting the two surfaces keeps schema validation
 * honest: the parser validates what the model can actually produce, and the
 * envelope adds non-model facts.
 *
 * `aesthetics` and `layouts` are always populated.
 * `interactions` and `systems` are required but may be empty arrays
 * when the brief does not signal the need for them.
 */
export interface RecommendationModelOutput {
  aesthetics: RankedPick[];
  layouts: RankedPick[];
  interactions: RankedPick[];
  systems: RankedPick[];
}

/**
 * Result of a recommendation call — model output enriched with server metadata.
 */
export interface RecommendationResult extends RecommendationModelOutput {
  /** ISO-8601 timestamp produced by the server when the result was generated */
  generatedAt: string;
  /** Model identifier used for the recommendation (e.g. "claude-haiku-4-5") */
  model: string;
}
