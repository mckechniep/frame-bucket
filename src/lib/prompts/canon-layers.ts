import type { Recipe } from '@/lib/types';
import { loadPosture, loadBaseCanon, loadOutputContract, loadAestheticOverride } from './loader';

export interface CanonLayers {
  posture: string;
  baseCanon: string;
  outputContract: string;
  override: string | null;
}

/**
 * Loads the four canon layers needed by both the generation and iteration
 * assemblers. The three invariant layers (posture, base canon, output contract)
 * are fetched in parallel; the aesthetic override is fetched only when
 * `recipe.aesthetic.hasOverride` is true.
 */
export async function loadCanonLayers(recipe: Recipe): Promise<CanonLayers> {
  const [posture, baseCanon, outputContract] = await Promise.all([
    loadPosture(),
    loadBaseCanon(),
    loadOutputContract(),
  ]);
  const override = recipe.aesthetic.hasOverride
    ? await loadAestheticOverride(recipe.aesthetic.id)
    : null;
  return { posture, baseCanon, outputContract, override };
}
