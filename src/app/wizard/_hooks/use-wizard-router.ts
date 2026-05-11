'use client';

import { usePathname, useRouter } from 'next/navigation';

import { nextStep, prevStep, STEPS, stepPath, type Step } from '@/lib/wizard/steps';

function deriveStep(pathname: string): Step | null {
  const match = pathname.match(/^\/wizard\/([^/?#]+)/);
  if (!match) return null;
  return STEPS.find((s) => s === match[1]) ?? null;
}

export function useWizardRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const currentStep = deriveStep(pathname);

  function goNext() {
    if (!currentStep) return;
    const next = nextStep(currentStep);
    if (next) router.push(stepPath(next));
  }

  function goPrev() {
    if (!currentStep) return;
    const prev = prevStep(currentStep);
    if (prev) router.push(stepPath(prev));
  }

  return { goNext, goPrev, currentStep };
}
