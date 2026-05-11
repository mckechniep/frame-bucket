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
  setRecommendation: (recommendation: RecommendationResult) => void;
  setSelectedRecipe: (recipe: Recipe) => void;
  appendRound: (round: WizardRound) => void;
  setActiveArtifactId: (id: string | null) => void;
  setCompareWithArtifactId: (id: string | null) => void;
  setCheckpointName: (artifactId: string, name: string | undefined) => void;
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
    (set) => ({
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

      reset: () => set({ ...initialState }),
    }),
    {
      name: WIZARD_PERSIST_KEY,
      storage: createWizardStorage(),
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
