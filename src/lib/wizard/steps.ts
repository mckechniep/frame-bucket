import type { WizardState } from './store';

export const STEPS = ['brief', 'recommend', 'generate'] as const;
export type Step = (typeof STEPS)[number];

type StepPrereqState = Pick<WizardState, 'brief' | 'recommendation' | 'selectedRecipe'>;

export function stepPath(step: Step): string {
  return `/wizard/${step}`;
}

export function prevStep(step: Step): Step | null {
  const index = STEPS.indexOf(step);
  if (index <= 0) return null;
  return STEPS[index - 1] ?? null;
}

export function nextStep(step: Step): Step | null {
  const index = STEPS.indexOf(step);
  if (index < 0 || index >= STEPS.length - 1) return null;
  return STEPS[index + 1] ?? null;
}

export function canEnterStep(step: Step, state: StepPrereqState): boolean {
  switch (step) {
    case 'brief':
      return true;
    case 'recommend':
      return state.brief !== null;
    case 'generate':
      return state.brief !== null && state.selectedRecipe !== null;
  }
}

export function firstAllowedStep(state: StepPrereqState): Step {
  if (state.brief !== null && state.selectedRecipe !== null) return 'generate';
  if (state.brief !== null) return 'recommend';
  return 'brief';
}
