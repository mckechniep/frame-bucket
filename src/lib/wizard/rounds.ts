import type { WizardRound } from './store';

/**
 * Returns the rounds belonging to one page's iteration chain.
 *
 * Walk direction: UP from `pageActiveArtifactId` → root (the round whose
 * parentArtifactId is null), following parentArtifactId links at each step.
 * This means passing the page's LATEST/active artifact returns the complete
 * chain — every round from the initial generation through every iteration.
 * Passing a mid-chain artifact returns that artifact and its ancestors only;
 * descendants (rounds generated after it) are NOT included because we walk
 * parent links, not child links.
 *
 * Returns rounds in iterationRound ascending order.
 * Returns [] if pageActiveArtifactId is not found in rounds.
 */
export function roundsForPage(rounds: WizardRound[], pageActiveArtifactId: string): WizardRound[] {
  // Build a lookup map: artifactId → round
  const byId = new Map<string, WizardRound>();
  for (const round of rounds) {
    byId.set(round.artifactId, round);
  }

  // If the starting artifact doesn't exist in rounds, return nothing
  if (!byId.has(pageActiveArtifactId)) {
    return [];
  }

  // Walk UP from the given artifact to the root, collecting artifactIds
  const chainIds: string[] = [];
  let current: string | null = pageActiveArtifactId;
  const visited = new Set<string>();
  while (current !== null) {
    if (visited.has(current)) break; // cycle guard — corrupt parentArtifactId data must not hang
    visited.add(current);
    const round = byId.get(current);
    if (!round) break;
    chainIds.push(current);
    current = round.parentArtifactId;
  }

  // Collect the rounds for those IDs, then sort by iterationRound asc
  return chainIds.map((id) => byId.get(id)!).sort((a, b) => a.iterationRound - b.iterationRound);
}
