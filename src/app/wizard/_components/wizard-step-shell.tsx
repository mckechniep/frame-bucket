'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import type { Taxonomy } from '@/lib/types';
import { canEnterStep, firstAllowedStep, stepPath, type Step } from '@/lib/wizard/steps';
import { useWizardStore } from '@/lib/wizard/store';

import { StepBrief } from './step-brief';
import { StepGenerate } from './step-generate';
import { StepRecommend } from './step-recommend';

interface WizardStepShellProps {
  step: Step;
  taxonomy: Taxonomy | null;
}

// Zustand persist hydrates asynchronously from localStorage. Until hydration
// completes the wizard would otherwise redirect everyone to /wizard/brief on
// first paint. useSyncExternalStore subscribes to persist.onFinishHydration
// and reads the snapshot via hasHydrated(); the server snapshot is `false`
// so SSR stays in the not-yet-hydrated state.
function useStoreHydrated(): boolean {
  return useSyncExternalStore(
    (callback) => useWizardStore.persist.onFinishHydration(callback),
    () => useWizardStore.persist.hasHydrated(),
    () => false,
  );
}

export function WizardStepShell({ step, taxonomy }: WizardStepShellProps) {
  const router = useRouter();
  const hydrated = useStoreHydrated();

  const brief = useWizardStore((s) => s.brief);
  const recommendation = useWizardStore((s) => s.recommendation);
  const selectedRecipe = useWizardStore((s) => s.selectedRecipe);

  useEffect(() => {
    if (!hydrated) return;
    const state = { brief, recommendation, selectedRecipe };
    if (canEnterStep(step, state)) return;
    router.replace(stepPath(firstAllowedStep(state)));
  }, [hydrated, step, brief, recommendation, selectedRecipe, router]);

  if (!hydrated) return null;
  if (!canEnterStep(step, { brief, recommendation, selectedRecipe })) return null;

  if (step === 'brief') return <StepBrief />;
  if (step === 'recommend') return <StepRecommend taxonomy={taxonomy} />;
  if (step === 'generate') return <StepGenerate />;
  return null;
}
