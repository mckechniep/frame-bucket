import { defaultContractStore } from './contract-store-factory';
import { defaultArchiveStore } from '@/lib/generation/archive-factory';
import { extractTokens } from './extract-tokens';
import { generateNarrative } from './narrative';
import { assembleContract } from './assemble';
import type { StoredContract, DesignTokens } from './types';

/**
 * Derive (or return the cached) design contract for a given artifact.
 *
 * This is the single public entry point that API routes and the wizard call
 * to resolve a design contract. Caching is keyed by artifactId, so the same
 * artifact always yields the same contract — correct snapshot semantics for
 * both live wizard preview and share page rendering.
 *
 * Flow:
 *   1. Cache HIT  → return immediately (no LLM call, no archive read).
 *   2. Cache MISS → read archive → extract → narrative → assemble → put → return.
 *
 * IMPORTANT: The cache-hit short-circuit is the most critical invariant here.
 * generateNarrative is a billable LLM call; calling it on every render would
 * be expensive and non-deterministic. Tests assert it is NEVER called on a hit.
 *
 * Throws:
 *   - `'ARTIFACT_NOT_FOUND: <id>'` when the archive has no record for the id.
 */
export async function deriveContract(
  artifactId: string,
  siteName: string,
): Promise<StoredContract> {
  // ── 1. Cache HIT ──────────────────────────────────────────────────────────
  const cached = await defaultContractStore().get(artifactId);
  if (cached) return cached;

  // ── 2. Load artifact ──────────────────────────────────────────────────────
  const record = await defaultArchiveStore().read(artifactId);
  if (!record) {
    throw new Error(`ARTIFACT_NOT_FOUND: ${artifactId}`);
  }

  // Prefer htmlSource (pre-image-injection model output) for extraction and
  // narrative — it is the model's actual output without megabytes of base64.
  // Fall back to html for archives written before htmlSource was captured.
  const source = record.htmlSource ?? record.html;
  const recipeSummary = record.recipeSummary ?? '';

  // ── 3. Extract design tokens ───────────────────────────────────────────────
  let tokens = extractTokens(source, recipeSummary, artifactId);

  // ── 4. Mark fallback when extraction yields nothing ───────────────────────
  // This indicates the artifact has no :root CSS custom properties and no
  // Google Fonts links — the contract will contain placeholder sections only.
  if (tokens.colors.length === 0 && tokens.fonts.length === 0) {
    tokens = {
      ...tokens,
      meta: { ...tokens.meta, fallback: true },
    } satisfies DesignTokens;
  }

  // ── 5. Generate narrative (billable, hard-timeout, never throws) ──────────
  const { narrative, modelId, cost } = await generateNarrative(tokens, source, recipeSummary);

  // ── 6. Assemble the three deliverable files ───────────────────────────────
  const { contractMd, tokensJson, tokensCss } = assembleContract(tokens, narrative, siteName);

  // ── 7. Build StoredContract ───────────────────────────────────────────────
  const stored: StoredContract = {
    tokens,
    contractMd,
    tokensJson,
    tokensCss,
    modelId,
    cost,
    createdAt: new Date().toISOString(),
  };

  // ── 8. Persist to cache ───────────────────────────────────────────────────
  await defaultContractStore().put(artifactId, stored);

  return stored;
}
