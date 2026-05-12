import type { Recipe } from './recipe';
import type { ArchiveRecord } from '@/lib/generation/archive';

/**
 * Request payload sent to /api/iterate. Feedback is bounded 10–1000 chars
 * to force concision — longer feedback usually means "regenerate from scratch"
 * rather than iterate, which is a different code path.
 *
 * `previousHtml` is optional. The server is the source of truth for the
 * parent's HTML — `/api/iterate` reads `parent.htmlSource` from the archive
 * via the `previousArtifactId`. Sending the HTML on the wire is a token-bomb
 * risk because post-injection artifacts can be multi-MB; clients should omit
 * it. The field is retained on the type for backwards compatibility with the
 * `iterate.ts` CLI and any old call sites.
 */
export interface IterationRequest {
  recipe: Recipe;
  previousHtml?: string;
  previousArtifactId: string;
  feedback: string;
}

/**
 * On-disk artifact shape for an iteration. Extends the base archive's
 * ArchiveRecord with parent linking and round tracking. iterationRound is 0
 * for the original generation and 1+ for each subsequent iteration.
 *
 * Note: The archive's `recipeSummary` field should include `(iter N)` when
 * iterationRound > 0 — this is enforced by the archive-writing logic in T10,
 * not by this type.
 */
export interface IterationArtifact extends ArchiveRecord {
  parentArtifactId: string;
  iterationRound: number;
}
