import type { Recipe } from '@/lib/types';
import { loadPosture, loadBaseCanon, loadOutputContract, loadAestheticOverride } from './loader';

export interface CanonLayers {
  posture: string;
  baseCanon: string;
  outputContract: string;
  override: string | null;
}

export interface InvariantLayers {
  posture: string;
  baseCanon: string;
  outputContract: string;
}

/**
 * The three page-agnostic canon layers (no aesthetic override, no recipe).
 * Used by the subpage assembler, where the design contract replaces the
 * aesthetic exploration that loadCanonLayers' override provides.
 */
export async function loadInvariantLayers(): Promise<InvariantLayers> {
  const [posture, baseCanon, outputContract] = await Promise.all([
    loadPosture(),
    loadBaseCanon(),
    loadOutputContract(),
  ]);
  return { posture, baseCanon, outputContract };
}

/**
 * Loads the four canon layers needed by both the generation and iteration
 * assemblers. The three invariant layers (posture, base canon, output contract)
 * are fetched in parallel; the aesthetic override is fetched only when
 * `recipe.aesthetic.hasOverride` is true.
 */
export async function loadCanonLayers(recipe: Recipe): Promise<CanonLayers> {
  const [invariant, override] = await Promise.all([
    loadInvariantLayers(),
    recipe.aesthetic.hasOverride
      ? loadAestheticOverride(recipe.aesthetic.id)
      : Promise.resolve(null),
  ]);
  return { ...invariant, override };
}
