// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Brief } from '@/lib/types';

const briefFixture: Brief = {
  projectName: 'Acme Coffee',
  industry: 'cafe',
  vibe: 'mom-and-pop',
  description: 'Neighborhood coffee shop landing page.',
};

async function importFreshStore() {
  vi.resetModules();
  return import('@/lib/wizard/store');
}

describe('wizard persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  test('WIZARD_PERSIST_KEY embeds the current version', async () => {
    const { WIZARD_PERSIST_KEY, WIZARD_PERSIST_VERSION } = await import('@/lib/wizard/persistence');
    expect(WIZARD_PERSIST_KEY).toBe(`frame-bucket-wizard@${WIZARD_PERSIST_VERSION}`);
    expect(WIZARD_PERSIST_VERSION).toBeGreaterThanOrEqual(1);
  });

  test('setting state writes to localStorage under the current key', async () => {
    const { useWizardStore } = await importFreshStore();
    const { WIZARD_PERSIST_KEY } = await import('@/lib/wizard/persistence');

    useWizardStore.getState().setBrief(briefFixture);

    const raw = window.localStorage.getItem(WIZARD_PERSIST_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.brief).toEqual(briefFixture);
  });

  test('a fresh store instance rehydrates from localStorage after manual rehydrate', async () => {
    // First instance: write state. (Persist writes are synchronous to
    // localStorage on every store update — no rehydrate needed for the write.)
    const first = await importFreshStore();
    first.useWizardStore.getState().setBrief(briefFixture);
    first.useWizardStore.getState().setActiveArtifactId('a-7');

    // Second instance: skipHydration: true means we have to call rehydrate
    // explicitly. This mirrors what WizardHydrator does on the client at
    // first paint — defers the localStorage read out of SSR's render phase
    // to avoid hydration mismatch warnings.
    const second = await importFreshStore();
    await second.useWizardStore.persist.rehydrate();
    const state = second.useWizardStore.getState();

    expect(state.brief).toEqual(briefFixture);
    expect(state.activeArtifactId).toBe('a-7');
  });

  test('compareWithArtifactId is excluded from persistence (partialize)', async () => {
    const first = await importFreshStore();
    first.useWizardStore.getState().setBrief(briefFixture);
    first.useWizardStore.getState().setCompareWithArtifactId('a-compare');

    const second = await importFreshStore();
    await second.useWizardStore.persist.rehydrate();
    const state = second.useWizardStore.getState();

    expect(state.brief).toEqual(briefFixture);
    expect(state.compareWithArtifactId).toBeNull();
  });

  test('stale state at an older version key is ignored', async () => {
    const { WIZARD_PERSIST_VERSION } = await import('@/lib/wizard/persistence');
    const staleKey = `frame-bucket-wizard@${WIZARD_PERSIST_VERSION - 1}`;

    window.localStorage.setItem(
      staleKey,
      JSON.stringify({
        state: {
          brief: { ...briefFixture, projectName: 'STALE' },
          rounds: [],
          activeArtifactId: 'stale-id',
        },
        version: 0,
      }),
    );

    const { useWizardStore } = await importFreshStore();
    const state = useWizardStore.getState();

    expect(state.brief).toBeNull();
    expect(state.activeArtifactId).toBeNull();
    expect(state.rounds).toEqual([]);
  });
});
