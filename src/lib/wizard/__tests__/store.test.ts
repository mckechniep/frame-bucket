// @vitest-environment jsdom

import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import type { Brief, Recipe, RecommendationResult, TaxonomyEntry } from '@/lib/types';

const briefFixture: Brief = {
  projectName: 'Acme Coffee',
  industry: 'cafe',
  posture: 'boutique',
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

  test('default state has nullish brief/recommendation/recipe, empty rounds, null siteId, empty pages, and activeSlug "/"', async () => {
    const { useWizardStore } = await importFreshStore();
    const state = useWizardStore.getState();

    expect(state.brief).toBeNull();
    expect(state.recommendation).toBeNull();
    expect(state.selectedRecipe).toBeNull();
    expect(state.rounds).toEqual([]);
    expect(state.activeArtifactId).toBeNull();
    expect(state.compareWithArtifactId).toBeNull();
    expect(state.siteId).toBeNull();
    expect(state.pages).toEqual([]);
    expect(state.activeSlug).toBe('/');
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

  test('reset clears everything back to default, including siteId, pages, and activeSlug', async () => {
    const { useWizardStore } = await importFreshStore();

    useWizardStore.getState().setBrief(briefFixture);
    useWizardStore.getState().setRecommendation(recommendationFixture);
    useWizardStore.getState().setSelectedRecipe(recipeFixture);
    useWizardStore.getState().appendRound(makeRound());
    useWizardStore.getState().setActiveArtifactId('a-1');
    useWizardStore.getState().setCompareWithArtifactId('a-2');
    useWizardStore.getState().setSiteId('site-abc');
    useWizardStore
      .getState()
      .addPage({ slug: '/about', title: 'About', artifactId: 'a-10', position: 1 });
    useWizardStore.getState().setActiveSlug('/about');

    useWizardStore.getState().reset();

    const state = useWizardStore.getState();
    expect(state.brief).toBeNull();
    expect(state.recommendation).toBeNull();
    expect(state.selectedRecipe).toBeNull();
    expect(state.rounds).toEqual([]);
    expect(state.activeArtifactId).toBeNull();
    expect(state.compareWithArtifactId).toBeNull();
    expect(state.siteId).toBeNull();
    expect(state.pages).toEqual([]);
    expect(state.activeSlug).toBe('/');
  });

  test('setSiteId updates immutably without mutating other state', async () => {
    const { useWizardStore } = await importFreshStore();
    useWizardStore.getState().setBrief(briefFixture);
    useWizardStore.getState().appendRound(makeRound());

    useWizardStore.getState().setSiteId('site-xyz');

    const state = useWizardStore.getState();
    expect(state.siteId).toBe('site-xyz');
    // Other fields untouched
    expect(state.brief).toEqual(briefFixture);
    expect(state.rounds).toHaveLength(1);
  });

  test('setSiteId can be cleared back to null', async () => {
    const { useWizardStore } = await importFreshStore();
    useWizardStore.getState().setSiteId('site-xyz');
    expect(useWizardStore.getState().siteId).toBe('site-xyz');

    useWizardStore.getState().setSiteId(null);
    expect(useWizardStore.getState().siteId).toBeNull();
  });

  test('partialize includes siteId — real localStorage round-trip', async () => {
    // Write: set siteId on the first instance; persist middleware writes to
    // localStorage synchronously on every state update.
    const first = await importFreshStore();
    first.useWizardStore.getState().setSiteId('site-persisted');

    // Read: a fresh module (= fresh store instance with skipHydration: true)
    // starts at null. After rehydrate() it should see the persisted siteId.
    const second = await importFreshStore();
    await second.useWizardStore.persist.rehydrate();

    expect(second.useWizardStore.getState().siteId).toBe('site-persisted');
  });

  test('getWizardState mirrors useWizardStore.getState()', async () => {
    const { useWizardStore, getWizardState } = await importFreshStore();
    useWizardStore.getState().setBrief(briefFixture);

    expect(getWizardState()).toBe(useWizardStore.getState());
    expect(getWizardState().brief).toEqual(briefFixture);
  });

  // ─── setSite ────────────────────────────────────────────────────────────────

  describe('setSite', () => {
    it('sets siteId, replaces pages sorted by position asc, and resets activeSlug to "/"', async () => {
      const { useWizardStore } = await importFreshStore();
      // Pre-set a non-default slug to confirm it gets reset
      useWizardStore.getState().setActiveSlug('/old');

      const pages = [
        { slug: '/contact', title: 'Contact', artifactId: 'a-3', position: 2 },
        { slug: '/', title: 'Home', artifactId: 'a-1', position: 0 },
        { slug: '/about', title: 'About', artifactId: 'a-2', position: 1 },
      ];
      useWizardStore.getState().setSite('site-new', pages);

      const state = useWizardStore.getState();
      expect(state.siteId).toBe('site-new');
      expect(state.activeSlug).toBe('/');
      expect(state.pages.map((p) => p.slug)).toEqual(['/', '/about', '/contact']);
    });

    it('replaces existing pages rather than appending', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .setSite('site-1', [{ slug: '/old-page', title: 'Old', artifactId: 'a-0', position: 0 }]);
      useWizardStore
        .getState()
        .setSite('site-1', [{ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 }]);

      expect(useWizardStore.getState().pages).toHaveLength(1);
      expect(useWizardStore.getState().pages[0]!.slug).toBe('/');
    });

    it('does not mutate the original state object', async () => {
      const { useWizardStore } = await importFreshStore();
      const before = useWizardStore.getState();
      useWizardStore
        .getState()
        .setSite('site-xyz', [{ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 }]);
      const after = useWizardStore.getState();
      expect(Object.is(before, after)).toBe(false);
    });
  });

  // ─── addPage ────────────────────────────────────────────────────────────────

  describe('addPage', () => {
    it('appends a page and re-sorts by position asc', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/contact', title: 'Contact', artifactId: 'a-3', position: 2 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-2', position: 1 });

      const { pages } = useWizardStore.getState();
      expect(pages.map((p) => p.slug)).toEqual(['/', '/about', '/contact']);
    });

    it('does not mutate the original pages array', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      const before = useWizardStore.getState().pages;
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-2', position: 1 });
      const after = useWizardStore.getState().pages;
      expect(Object.is(before, after)).toBe(false);
    });
  });

  // ─── setActiveSlug ──────────────────────────────────────────────────────────

  describe('setActiveSlug', () => {
    it('updates activeSlug', async () => {
      const { useWizardStore } = await importFreshStore();
      expect(useWizardStore.getState().activeSlug).toBe('/');
      useWizardStore.getState().setActiveSlug('/about');
      expect(useWizardStore.getState().activeSlug).toBe('/about');
    });
  });

  // ─── setPageArtifact ────────────────────────────────────────────────────────

  describe('setPageArtifact', () => {
    it('updates the matching page artifactId and leaves others untouched', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-2', position: 1 });

      useWizardStore.getState().setPageArtifact('/about', 'a-2b');

      const { pages } = useWizardStore.getState();
      expect(pages.find((p) => p.slug === '/')?.artifactId).toBe('a-1');
      expect(pages.find((p) => p.slug === '/about')?.artifactId).toBe('a-2b');
    });

    it('is a no-op for an unknown slug', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });

      useWizardStore.getState().setPageArtifact('/nonexistent', 'a-99');

      expect(useWizardStore.getState().pages).toHaveLength(1);
      expect(useWizardStore.getState().pages[0]!.artifactId).toBe('a-1');
    });

    it('does not mutate the original pages array', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      const before = useWizardStore.getState().pages;

      useWizardStore.getState().setPageArtifact('/', 'a-1b');
      const after = useWizardStore.getState().pages;
      expect(Object.is(before, after)).toBe(false);
    });
  });

  // ─── removePage ─────────────────────────────────────────────────────────────

  describe('removePage', () => {
    it('removes the page with the given slug', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-2', position: 1 });

      useWizardStore.getState().removePage('/about');

      const { pages } = useWizardStore.getState();
      expect(pages).toHaveLength(1);
      expect(pages[0]!.slug).toBe('/');
    });

    it('resets activeSlug to "/" when the active page is removed', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-2', position: 1 });
      useWizardStore.getState().setActiveSlug('/about');

      useWizardStore.getState().removePage('/about');

      expect(useWizardStore.getState().activeSlug).toBe('/');
    });

    it('does not change activeSlug when a non-active page is removed', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-2', position: 1 });
      useWizardStore.getState().setActiveSlug('/about');

      useWizardStore.getState().removePage('/');

      expect(useWizardStore.getState().activeSlug).toBe('/about');
    });

    it('does not mutate the original pages array', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-2', position: 1 });
      const before = useWizardStore.getState().pages;

      useWizardStore.getState().removePage('/about');
      const after = useWizardStore.getState().pages;
      expect(Object.is(before, after)).toBe(false);
    });
  });

  // ─── partialize: pages + activeSlug ─────────────────────────────────────────

  test('partialize includes pages and activeSlug — real localStorage round-trip', async () => {
    const first = await importFreshStore();
    first.useWizardStore.getState().setSite('site-rt', [
      { slug: '/', title: 'Home', artifactId: 'a-rt-1', position: 0 },
      { slug: '/about', title: 'About', artifactId: 'a-rt-2', position: 1 },
    ]);
    first.useWizardStore.getState().setActiveSlug('/about');

    const second = await importFreshStore();
    await second.useWizardStore.persist.rehydrate();

    expect(second.useWizardStore.getState().pages).toHaveLength(2);
    expect(second.useWizardStore.getState().pages[0]!.slug).toBe('/');
    expect(second.useWizardStore.getState().activeSlug).toBe('/about');
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

    test('drops pages whose artifactId is not in existingIds', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'p-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'p-2', position: 1 });
      useWizardStore
        .getState()
        .addPage({ slug: '/contact', title: 'Contact', artifactId: 'p-3', position: 2 });
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'p-1' }));

      const dropped = useWizardStore.getState().hydrateAndValidate(['p-1', 'p-3']);

      // dropped count is about ROUNDS, not pages
      expect(dropped).toBe(0);
      const { pages } = useWizardStore.getState();
      expect(pages.map((p) => p.slug)).toEqual(['/', '/contact']);
    });

    test('resets activeSlug to "/" when the active page is dropped', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'p-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'p-2', position: 1 });
      useWizardStore.getState().setActiveSlug('/about');
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'p-1' }));

      useWizardStore.getState().hydrateAndValidate(['p-1']);

      expect(useWizardStore.getState().pages.map((p) => p.slug)).toEqual(['/']);
      expect(useWizardStore.getState().activeSlug).toBe('/');
    });

    test('resets activeSlug to "/" when all pages are dropped', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'p-2', position: 1 });
      useWizardStore.getState().setActiveSlug('/about');
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'r-1' }));

      // p-2 not in existingIds but r-1 is, so droppedCount is 0 but p-2 is dropped
      useWizardStore.getState().hydrateAndValidate(['r-1']);

      expect(useWizardStore.getState().pages).toEqual([]);
      expect(useWizardStore.getState().activeSlug).toBe('/');
    });

    test('does not change activeSlug when the dropped pages do not include the active slug', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'p-1', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'p-2', position: 1 });
      useWizardStore.getState().setActiveSlug('/');
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'p-1' }));

      useWizardStore.getState().hydrateAndValidate(['p-1']);

      expect(useWizardStore.getState().activeSlug).toBe('/');
    });

    test('keeps subpage whose artifactId IS included in existingIds (hydrator bug regression)', async () => {
      // Regression: wizard-hydrator previously sent only round artifactIds to
      // /api/artifact/exists. Because subpages are added via addPage (not
      // appendRound), their artifactIds were never in the queried set, so
      // hydrateAndValidate treated every subpage as an orphan and dropped it.
      // The fix unions page artifactIds into the query; this test verifies the
      // store-level survival logic is correct when the full union is passed.
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-root' }));
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-root', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-sub', position: 1 });

      // Both artifactIds passed — simulates the FIXED hydrator behaviour.
      const dropped = useWizardStore.getState().hydrateAndValidate(['a-root', 'a-sub']);

      expect(dropped).toBe(0);
      const { pages } = useWizardStore.getState();
      expect(pages.map((p) => p.slug)).toEqual(['/', '/about']);
    });

    test('drops subpage when its artifactId is absent from existingIds (old hydrator bug scenario)', async () => {
      // Demonstrates the BUG: if the hydrator only passed round ids (omitting
      // page ids), hydrateAndValidate would drop the /about subpage because
      // 'a-sub' is not in the existence-check result set.
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'a-root' }));
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'a-root', position: 0 });
      useWizardStore
        .getState()
        .addPage({ slug: '/about', title: 'About', artifactId: 'a-sub', position: 1 });

      // Only round ids passed — simulates the BROKEN hydrator behaviour.
      useWizardStore.getState().hydrateAndValidate(['a-root']);

      const { pages } = useWizardStore.getState();
      // /about is gone because 'a-sub' was not included in the existence check.
      expect(pages.map((p) => p.slug)).toEqual(['/']);
    });

    test('still returns dropped-rounds count and existing round-drop behavior is unchanged', async () => {
      const { useWizardStore } = await importFreshStore();
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'r-1' }));
      useWizardStore.getState().appendRound(makeRound({ artifactId: 'r-2', iterationRound: 1 }));
      useWizardStore
        .getState()
        .addPage({ slug: '/', title: 'Home', artifactId: 'p-orphan', position: 0 });

      const dropped = useWizardStore.getState().hydrateAndValidate(['r-1']);

      expect(dropped).toBe(1); // r-2 was dropped from rounds
      expect(useWizardStore.getState().rounds.map((r) => r.artifactId)).toEqual(['r-1']);
      // p-orphan has an artifactId not in existingIds, so it should be dropped
      expect(useWizardStore.getState().pages).toEqual([]);
    });
  });
});
