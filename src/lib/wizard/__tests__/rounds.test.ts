import { describe, expect, it } from 'vitest';

import type { WizardRound } from '@/lib/wizard/store';
import { roundsForPage } from '@/lib/wizard/rounds';

function makeRound(
  artifactId: string,
  parentArtifactId: string | null,
  iterationRound: number,
): WizardRound {
  return {
    artifactId,
    parentArtifactId,
    iterationRound,
    recipeSummary: 'Test recipe',
    cost: 1.0,
    generatedAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('roundsForPage', () => {
  it('returns [] when pageActiveArtifactId is not in rounds', () => {
    const rounds = [makeRound('a-1', null, 0)];
    expect(roundsForPage(rounds, 'unknown-id')).toEqual([]);
  });

  it('returns [] for an empty rounds array', () => {
    expect(roundsForPage([], 'a-1')).toEqual([]);
  });

  // ─── single chain, querying from the latest artifact ────────────────────────

  it('returns a single-round chain when there is only one round', () => {
    const r0 = makeRound('a-0', null, 0);
    expect(roundsForPage([r0], 'a-0')).toEqual([r0]);
  });

  it('returns all rounds in iterationRound asc order when queried from the latest', () => {
    const r0 = makeRound('a-0', null, 0);
    const r1 = makeRound('a-1', 'a-0', 1);
    const r2 = makeRound('a-2', 'a-1', 2);

    const result = roundsForPage([r0, r1, r2], 'a-2');

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.artifactId)).toEqual(['a-0', 'a-1', 'a-2']);
    expect(result.map((r) => r.iterationRound)).toEqual([0, 1, 2]);
  });

  it('returns rounds sorted by iterationRound asc even if the input array is unsorted', () => {
    const r0 = makeRound('a-0', null, 0);
    const r1 = makeRound('a-1', 'a-0', 1);
    const r2 = makeRound('a-2', 'a-1', 2);

    // Pass in reverse order
    const result = roundsForPage([r2, r0, r1], 'a-2');

    expect(result.map((r) => r.artifactId)).toEqual(['a-0', 'a-1', 'a-2']);
  });

  // ─── two independent chains (two pages) ─────────────────────────────────────

  it('returns only the queried page chain when two independent chains exist', () => {
    // Page 1 chain: p1-r0 → p1-r1 → p1-r2
    const p1r0 = makeRound('p1-r0', null, 0);
    const p1r1 = makeRound('p1-r1', 'p1-r0', 1);
    const p1r2 = makeRound('p1-r2', 'p1-r1', 2);

    // Page 2 chain: p2-r0 → p2-r1
    const p2r0 = makeRound('p2-r0', null, 0);
    const p2r1 = makeRound('p2-r1', 'p2-r0', 1);

    const allRounds = [p1r0, p1r1, p1r2, p2r0, p2r1];

    // Query page 1's chain
    const chain1 = roundsForPage(allRounds, 'p1-r2');
    expect(chain1.map((r) => r.artifactId)).toEqual(['p1-r0', 'p1-r1', 'p1-r2']);

    // Query page 2's chain
    const chain2 = roundsForPage(allRounds, 'p2-r1');
    expect(chain2.map((r) => r.artifactId)).toEqual(['p2-r0', 'p2-r1']);
  });

  // ─── querying from a mid-chain artifact ──────────────────────────────────────

  it('returns only the queried artifact and its ancestors when given a mid-chain artifact', () => {
    // Chain: r0 → r1 → r2 → r3
    const r0 = makeRound('a-0', null, 0);
    const r1 = makeRound('a-1', 'a-0', 1);
    const r2 = makeRound('a-2', 'a-1', 2);
    const r3 = makeRound('a-3', 'a-2', 3);

    // Query from r1 (a mid-chain point): should return r0 + r1 only
    // r2 and r3 are descendants of r1 — they are NOT included because
    // roundsForPage walks UP via parentArtifactId, not down to children.
    const result = roundsForPage([r0, r1, r2, r3], 'a-1');

    expect(result.map((r) => r.artifactId)).toEqual(['a-0', 'a-1']);
  });

  it('returns only the root round when queried from the root artifact', () => {
    const r0 = makeRound('a-0', null, 0);
    const r1 = makeRound('a-1', 'a-0', 1);
    const r2 = makeRound('a-2', 'a-1', 2);

    // Querying from the root only returns the root itself (no ancestors above)
    const result = roundsForPage([r0, r1, r2], 'a-0');

    expect(result.map((r) => r.artifactId)).toEqual(['a-0']);
  });

  // ─── does not mutate input ───────────────────────────────────────────────────

  it('does not mutate the input rounds array', () => {
    const r0 = makeRound('a-0', null, 0);
    const r1 = makeRound('a-1', 'a-0', 1);
    const input = [r1, r0]; // deliberately unsorted
    const inputCopy = [...input];

    roundsForPage(input, 'a-1');

    expect(input).toEqual(inputCopy);
  });
});
