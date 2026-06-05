import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Brief, Recipe, RecommendationResult } from '@/lib/types';

import { createWizardStorage, WIZARD_PERSIST_KEY } from './persistence';

export interface WizardRound {
  artifactId: string;
  parentArtifactId: string | null;
  iterationRound: number;
  recipeSummary: string;
  cost: number;
  generatedAt: string;
  checkpointName?: string;
}

export interface WizardPage {
  /** URL-safe slug, e.g. "/" or "/about". */
  slug: string;
  /** Human-readable display title, e.g. "Home" or "About". */
  title: string;
  /** The artifact currently rendered at this slug (advances on each iteration). */
  artifactId: string;
  /** Sort order. Pages are always stored/returned ascending by this field. */
  position: number;
}

export interface WizardState {
  brief: Brief | null;
  recommendation: RecommendationResult | null;
  selectedRecipe: Recipe | null;
  rounds: WizardRound[];
  activeArtifactId: string | null;
  compareWithArtifactId: string | null;
  // siteId, pages, and activeSlug added in Task 21 for multi-page site modelling.
  siteId: string | null;
  /** The pages belonging to the current site, sorted by position ascending. */
  pages: WizardPage[];
  /** The slug of the page currently shown in the wizard canvas. Defaults to "/". */
  activeSlug: string;
}

export interface WizardActions {
  setBrief: (brief: Brief) => void;
  setRecommendation: (recommendation: RecommendationResult | null) => void;
  setSelectedRecipe: (recipe: Recipe | null) => void;
  appendRound: (round: WizardRound) => void;
  setActiveArtifactId: (id: string | null) => void;
  setCompareWithArtifactId: (id: string | null) => void;
  /** Keep for backward-compat (step-generate uses it). For setting the full
   *  site context (siteId + pages together), prefer setSite. */
  setSiteId: (siteId: string | null) => void;
  /**
   * Sets siteId AND replaces the page manifest in a single atomic update.
   * Pages are sorted by position asc. activeSlug is reset to "/".
   * Use this when a fresh landing page is generated — it establishes the
   * site and its initial "/" page together.
   */
  setSite: (siteId: string, pages: WizardPage[]) => void;
  /** Immutably appends a page and re-sorts the manifest by position asc. */
  addPage: (page: WizardPage) => void;
  setActiveSlug: (slug: string) => void;
  /**
   * Immutably updates the artifactId for the page matching `slug`.
   * No-op if the slug is not found.
   */
  setPageArtifact: (slug: string, artifactId: string) => void;
  /**
   * Immutably removes the page with the given slug.
   * If the removed slug was the activeSlug, resets activeSlug to "/".
   */
  removePage: (slug: string) => void;
  setCheckpointName: (artifactId: string, name: string | undefined) => void;
  /**
   * Drop persisted rounds whose artifactIds aren't in `existingIds`. Called
   * once per session after Zustand persist hydrates from localStorage, with
   * the result of /api/artifact/exists. Returns the number of dropped rounds
   * so the caller can surface a one-time notice.
   *
   * Side effects:
   *  - rounds: filtered to existingIds
   *  - activeArtifactId: falls back to the latest remaining round (or null)
   *  - compareWithArtifactId: cleared if its target was dropped
   *  - pages: pages whose artifactId is not in existingIds are also dropped
   *  - activeSlug: reset to "/" if the active page was dropped or pages is now empty
   */
  hydrateAndValidate: (existingIds: string[]) => number;
  reset: () => void;
}

const initialState: WizardState = {
  brief: null,
  recommendation: null,
  selectedRecipe: null,
  rounds: [],
  activeArtifactId: null,
  compareWithArtifactId: null,
  siteId: null,
  pages: [],
  activeSlug: '/',
};

export const useWizardStore = create<WizardState & WizardActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setBrief: (brief) => set({ brief }),
      setRecommendation: (recommendation) => set({ recommendation }),
      setSelectedRecipe: (selectedRecipe) => set({ selectedRecipe }),

      appendRound: (round) => set((state) => ({ rounds: [...state.rounds, round] })),

      setActiveArtifactId: (activeArtifactId) => set({ activeArtifactId }),
      setCompareWithArtifactId: (compareWithArtifactId) => set({ compareWithArtifactId }),
      setSiteId: (siteId) => set({ siteId }),

      setSite: (siteId, pages) =>
        set({
          siteId,
          pages: [...pages].sort((a, b) => a.position - b.position),
          activeSlug: '/',
        }),

      addPage: (page) =>
        set((state) => ({
          pages: [...state.pages, page].sort((a, b) => a.position - b.position),
        })),

      setActiveSlug: (activeSlug) => set({ activeSlug }),

      setPageArtifact: (slug, artifactId) =>
        set((state) => ({
          pages: state.pages.map((p) => (p.slug === slug ? { ...p, artifactId } : p)),
        })),

      removePage: (slug) =>
        set((state) => {
          const pages = state.pages.filter((p) => p.slug !== slug);
          const activeSlug = state.activeSlug === slug ? '/' : state.activeSlug;
          return { pages, activeSlug };
        }),

      setCheckpointName: (artifactId, name) =>
        set((state) => ({
          rounds: state.rounds.map((round) => {
            if (round.artifactId !== artifactId) return round;
            const trimmed = typeof name === 'string' ? name.trim() : '';
            if (!trimmed) {
              return {
                artifactId: round.artifactId,
                parentArtifactId: round.parentArtifactId,
                iterationRound: round.iterationRound,
                recipeSummary: round.recipeSummary,
                cost: round.cost,
                generatedAt: round.generatedAt,
              };
            }
            return { ...round, checkpointName: trimmed };
          }),
        })),

      hydrateAndValidate: (existingIds) => {
        const existing = new Set(existingIds);
        const state = get();

        // ── rounds ────────────────────────────────────────────────────────────
        const survivingRounds = state.rounds.filter((r) => existing.has(r.artifactId));
        const droppedCount = state.rounds.length - survivingRounds.length;

        // ── pages (side effect) ───────────────────────────────────────────────
        // Drop pages whose artifactId no longer exists in the backend. This
        // prevents the canvas from pointing at a deleted artifact after a
        // fresh session load.
        const survivingPages = state.pages.filter((p) => existing.has(p.artifactId));
        const pageWasDropped = survivingPages.length < state.pages.length;
        const activePageSurvived = survivingPages.some((p) => p.slug === state.activeSlug);
        const newActiveSlug = pageWasDropped && !activePageSurvived ? '/' : state.activeSlug;

        // Only call set() when something actually changed
        if (droppedCount === 0 && !pageWasDropped) return 0;

        const latestSurvivor = survivingRounds[survivingRounds.length - 1] ?? null;
        const activeStillValid =
          state.activeArtifactId !== null && existing.has(state.activeArtifactId);
        const compareStillValid =
          state.compareWithArtifactId !== null && existing.has(state.compareWithArtifactId);

        set({
          rounds: survivingRounds,
          activeArtifactId: activeStillValid
            ? state.activeArtifactId
            : (latestSurvivor?.artifactId ?? null),
          compareWithArtifactId: compareStillValid ? state.compareWithArtifactId : null,
          pages: survivingPages,
          activeSlug: newActiveSlug,
        });
        return droppedCount;
      },

      reset: () => set({ ...initialState }),
    }),
    {
      name: WIZARD_PERSIST_KEY,
      storage: createWizardStorage(),
      // localStorage is a synchronous API, which means Zustand's persist
      // middleware loads from it *synchronously* on first store access. If
      // we let that run during SSR + first client render, the server sees
      // an empty store but the client sees a hydrated one — every component
      // reading the store gets a hydration mismatch warning. skipHydration
      // defers the read until we explicitly call `persist.rehydrate()`
      // from a client-only effect after first paint (see WizardHydrator).
      skipHydration: true,
      partialize: (state) => ({
        brief: state.brief,
        recommendation: state.recommendation,
        selectedRecipe: state.selectedRecipe,
        rounds: state.rounds,
        activeArtifactId: state.activeArtifactId,
        siteId: state.siteId,
        pages: state.pages,
        activeSlug: state.activeSlug,
      }),
    },
  ),
);

export function getWizardState(): WizardState & WizardActions {
  return useWizardStore.getState();
}
