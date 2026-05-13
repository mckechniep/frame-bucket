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

export interface WizardState {
  brief: Brief | null;
  recommendation: RecommendationResult | null;
  selectedRecipe: Recipe | null;
  rounds: WizardRound[];
  activeArtifactId: string | null;
  compareWithArtifactId: string | null;
}

export interface WizardActions {
  setBrief: (brief: Brief) => void;
  setRecommendation: (recommendation: RecommendationResult | null) => void;
  setSelectedRecipe: (recipe: Recipe | null) => void;
  appendRound: (round: WizardRound) => void;
  setActiveArtifactId: (id: string | null) => void;
  setCompareWithArtifactId: (id: string | null) => void;
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
        const survivingRounds = state.rounds.filter((r) => existing.has(r.artifactId));
        const droppedCount = state.rounds.length - survivingRounds.length;
        if (droppedCount === 0) return 0;

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
      }),
    },
  ),
);

export function getWizardState(): WizardState & WizardActions {
  return useWizardStore.getState();
}
