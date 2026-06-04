'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import type { Taxonomy } from '@/lib/types';
import { canEnterStep, firstAllowedStep, stepPath, type Step } from '@/lib/wizard/steps';
import { useWizardStore } from '@/lib/wizard/store';

import { useWizardHydrated } from '../_hooks/use-wizard-hydrated';
import { StepBrief } from './step-brief';
import { StepGenerate } from './step-generate';
import { StepRecommend } from './step-recommend';

interface WizardStepShellProps {
  step: Step;
  taxonomy: Taxonomy | null;
}

// Zustand persist hydrates asynchronously from localStorage (skipHydration).
// Until then this shell renders nothing — both on the server and on the first
// client render — so the whole step subtree is gated behind a single hydration
// boundary (see useWizardHydrated; its server snapshot is `false`). This both
// avoids a flash-redirect to /wizard/brief and keeps any store-derived markup
// in the steps out of SSR, so they can never trip a hydration mismatch.
export function WizardStepShell({ step, taxonomy }: WizardStepShellProps) {
  const router = useRouter();
  const hydrated = useWizardHydrated();

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
