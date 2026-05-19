// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Brief, Recipe, RecommendationResult, TaxonomyEntry } from '@/lib/types';

const briefFixture: Brief = {
  projectName: 'Acme Coffee',
  industry: 'cafe',
  vibe: 'mom-and-pop',
  description: 'Neighborhood coffee shop landing page with menu and hours.',
};

const aestheticFixture: TaxonomyEntry = {
  id: 'aes-warm-organic',
  bucket: 'aesthetic',
  name: 'Warm Organic',
  shortDefinition: 'Earthy palette, hand-set type.',
  coreMood: 'Cozy, lived-in.',
  bestUseCase: 'Cafes, bakeries.',
  distinctiveSignals: [],
  notes: '',
  notionId: 'n-1',
  hasOverride: true,
};

const layoutFixture: TaxonomyEntry = {
  id: 'lay-editorial',
  bucket: 'layout',
  name: 'Editorial',
  shortDefinition: 'Magazine rhythm.',
  coreMood: 'Considered.',
  bestUseCase: 'Story-led pages.',
  distinctiveSignals: [],
  notes: '',
  notionId: 'n-2',
  hasOverride: false,
};

const recipeFixture: Recipe = {
  brief: briefFixture,
  aesthetic: aestheticFixture,
  layout: layoutFixture,
};

const recommendationFixture: RecommendationResult = {
  aesthetics: [
    {
      entryId: 'aes-warm-organic',
      entryName: 'Warm Organic',
      confidence: 0.91,
      reasoning: 'Fits cafe.',
    },
  ],
  layouts: [
    { entryId: 'lay-editorial', entryName: 'Editorial', confidence: 0.82, reasoning: 'Story-led.' },
  ],
  interactions: [],
  systems: [],
  generatedAt: '2026-05-10T22:00:00.000Z',
  model: 'claude-haiku-4-5',
};

function makeRound(
  overrides: Partial<{
    artifactId: string;
    parentArtifactId: string | null;
    iterationRound: number;
    recipeSummary: string;
    cost: number;
    generatedAt: string;
    checkpointName: string;
  }> = {},
) {
  return {
    artifactId: overrides.artifactId ?? 'a-1',
    parentArtifactId: overrides.parentArtifactId ?? null,
    iterationRound: overrides.iterationRound ?? 0,
    recipeSummary: overrides.recipeSummary ?? 'Warm Organic × Editorial',
    cost: overrides.cost ?? 1.23,
    generatedAt: overrides.generatedAt ?? '2026-05-10T22:01:00.000Z',
    ...(overrides.checkpointName !== undefined ? { checkpointName: overrides.checkpointName } : {}),
  };
}

async function importFreshStore() {
  vi.resetModules();
  return import('@/lib/wizard/store');
}

describe('wizard store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  test('default state has nullish brief/recommendation/recipe and empty rounds', async () => {
    const { useWizardStore } = await importFreshStore();
    const state = useWizardStore.getState();

    expect(state.brief).toBeNull();
    expect(state.recommendation).toBeNull();
    expect(state.selectedRecipe).toBeNull();
    expect(state.rounds).toEqual([]);
    expect(state.activeArtifactId).toBeNull();
    expect(state.compareWithArtifactId).toBeNull();
  });

  test('setBrief / setRecommendation / setSelectedRecipe round-trip', async () => {
    const { useWizardStore } = await importFreshStore();

    useWizardStore.getState().setBrief(briefFixture);
    useWizardStore.getState().setRecommendation(recommendationFixture);
    useWizardStore.getState().setSelectedRecipe(recipeFixture);

    const state = useWizardStore.getState();
    expect(state.brief).toEqual(briefFixture);
    expect(state.recommendation).toEqual(recommendationFixture);
    expect(state.selectedRecipe).toEqual(recipeFixture);
  });

  test('appendRound preserves order and parent linkage', async () => {
    const { useWizardStore } = await importFreshStore();

    const round0 = makeRound({ artifactId: 'a-0', iterationRound: 0, parentArtifactId: null });
    const round1 = makeRound({ artifactId: 'a-1', iterationRound: 1, parentArtifactId: 'a-0' });
    const round2 = makeRound({ artifactId: 'a-2', iterationRound: 2, parentArtifactId: 'a-1' });

    useWizardStore.getState().appendRound(round0);
    useWizardStore.getState().appendRound(round1);
    useWizardStore.getState().appendRound(round2);

    const { rounds } = useWizardStore.getState();
    expect(rounds.map((r) => r.artifactId)).toEqual(['a-0', 'a-1', 'a-2']);
    expect(rounds[1]!.parentArtifactId).toBe('a-0');
    expect(rounds[2]!.parentArtifactId).toBe('a-1');
    expect(rounds[2]!.iterationRound).toBe(2);
  });

  test('setCheckpointName updates only the targeted round', async () => {
    const { useWizardStore } = await importFreshStore();

    useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-0' }));
    useWizardStore
      .getState()
      .appendRound(makeRound({ artifactId: 'a-1', iterationRound: 1, parentArtifactId: 'a-0' }));

    useWizardStore.getState().setCheckpointName('a-1', 'warm palette landed');

    const { rounds } = useWizardStore.getState();
    expect(rounds.find((r) => r.artifactId === 'a-0')?.checkpointName).toBeUndefined();
    expect(rounds.find((r) => r.artifactId === 'a-1')?.checkpointName).toBe('warm palette landed');
  });

  test('setCheckpointName with empty or undefined clears the existing name', async () => {
    const { useWizardStore } = await importFreshStore();
    useWizardStore
      .getState()
      .appendRound(makeRound({ artifactId: 'a-0', checkpointName: 'original' }));

    useWizardStore.getState().setCheckpointName('a-0', '');
    expect(useWizardStore.getState().rounds[0]!.checkpointName).toBeUndefined();

    useWizardStore.getState().setCheckpointName('a-0', 'second name');
    useWizardStore.getState().setCheckpointName('a-0', undefined);
    expect(useWizardStore.getState().rounds[0]!.checkpointName).toBeUndefined();
  });

  test('setActiveArtifactId and setCompareWithArtifactId are independent', async () => {
    const { useWizardStore } = await importFreshStore();
    useWizardStore.getState().setActiveArtifactId('a-0');
    useWizardStore.getState().setCompareWithArtifactId('a-1');

    const state = useWizardStore.getState();
    expect(state.activeArtifactId).toBe('a-0');
    expect(state.compareWithArtifactId).toBe('a-1');
  });

  test('reset clears everything back to default', async () => {
    const { useWizardStore } = await importFreshStore();

    useWizardStore.getState().setBrief(briefFixture);
    useWizardStore.getState().setRecommendation(recommendationFixture);
    useWizardStore.getState().setSelectedRecipe(recipeFixture);
    useWizardStore.getState().appendRound(makeRound());
    useWizardStore.getState().setActiveArtifactId('a-1');
    useWizardStore.getState().setCompareWithArtifactId('a-2');

    useWizardStore.getState().reset();

    const state = useWizardStore.getState();
    expect(state.brief).toBeNull();
    expect(state.recommendation).toBeNull();
    expect(state.selectedRecipe).toBeNull();
    expect(state.rounds).toEqual([]);
    expect(state.activeArtifactId).toBeNull();
    expect(state.compareWithArtifactId).toBeNull();
  });

  test('getWizardState mirrors useWizardStore.getState()', async () => {
    const { useWizardStore, getWizardState } = await importFreshStore();
    useWizardStore.getState().setBrief(briefFixture);

    expect(getWizardState()).toBe(useWizardStore.getState());
    expect(getWizardState().brief).toEqual(briefFixture);
  });

  describe('hydrateAndValidate', () => {
    test('drops rounds whose ids are missing from existingIds', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-1' }));
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-2', iterationRound: 1 }));
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-3', iterationRound: 2 }));

      const dropped = useWizardStore.getState().hydrateAndValidate(['a-1', 'a-3']);

      expect(dropped).toBe(1);
      expect(useWizardStore.getState().rounds.map((r) => r.artifactId)).toEqual(['a-1', 'a-3']);
    });

    test('returns 0 and is a no-op when nothing was dropped', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-1' }));
      useWizardStore.getState().setActiveArtifactId('a-1');

      const dropped = useWizardStore.getState().hydrateAndValidate(['a-1', 'a-2']);

      expect(dropped).toBe(0);
      expect(useWizardStore.getState().rounds).toHaveLength(1);
      expect(useWizardStore.getState().activeArtifactId).toBe('a-1');
    });

    test('falls activeArtifactId back to the latest survivor when its target was dropped', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-1' }));
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-2', iterationRound: 1 }));
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-3', iterationRound: 2 }));
      useWizardStore.getState().setActiveArtifactId('a-3');

      useWizardStore.getState().hydrateAndValidate(['a-1', 'a-2']);

      expect(useWizardStore.getState().activeArtifactId).toBe('a-2');
    });

    test('sets activeArtifactId to null when no rounds survive', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-1' }));
      useWizardStore.getState().setActiveArtifactId('a-1');

      useWizardStore.getState().hydrateAndValidate([]);

      expect(useWizardStore.getState().rounds).toEqual([]);
      expect(useWizardStore.getState().activeArtifactId).toBeNull();
    });

    test('clears compareWithArtifactId when its target was dropped', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-1' }));
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-2', iterationRound: 1 }));
      useWizardStore.getState().setActiveArtifactId('a-2');
      useWizardStore.getState().setCompareWithArtifactId('a-1');

      useWizardStore.getState().hydrateAndValidate(['a-2']);

      expect(useWizardStore.getState().compareWithArtifactId).toBeNull();
    });
  });
});
