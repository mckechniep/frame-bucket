'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { canEnterStep, STEPS, stepPath, type Step } from '@/lib/wizard/steps';
import { useWizardStore } from '@/lib/wizard/store';

const STEP_LABELS: Record<Step, string> = {
  brief: 'Brief',
  recommend: 'Recommendations',
  generate: 'Generate',
};

function deriveCurrentStep(pathname: string): Step | null {
  const match = pathname.match(/^\/wizard\/([^/?#]+)/);
  if (!match) return null;
  const candidate = match[1];
  return STEPS.find((s) => s === candidate) ?? null;
}

export function WizardProgressBar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentStep = deriveCurrentStep(pathname);
  const currentIndex = currentStep ? STEPS.indexOf(currentStep) : -1;

  // Individual selectors — Zustand v5 uses Object.is equality, so returning a
  // fresh object literal from a selector triggers an infinite-loop warning
  // from useSyncExternalStore on every render. Selecting each slot separately
  // keeps the references stable.
  const brief = useWizardStore((s) => s.brief);
  const recommendation = useWizardStore((s) => s.recommendation);
  const selectedRecipe = useWizardStore((s) => s.selectedRecipe);

  function handleStepClick(step: Step) {
    if (!canEnterStep(step, { brief, recommendation, selectedRecipe })) return;
    router.push(stepPath(step));
  }

  return (
    <nav
      aria-label="Wizard progress"
      className="flex items-center gap-[var(--space-2)] sm:gap-[var(--space-4)]"
    >
      {STEPS.map((step, index) => {
        const isCurrent = step === currentStep;
        const isCompleted = currentIndex > index;
        const reachable = canEnterStep(step, { brief, recommendation, selectedRecipe });
        const isClickable = !isCurrent && reachable;

        return (
          <div
            key={step}
            className="flex items-center gap-[var(--space-2)] sm:gap-[var(--space-3)]"
          >
            <button
              type="button"
              onClick={() => handleStepClick(step)}
              disabled={!isClickable}
              aria-current={isCurrent ? 'step' : undefined}
              className={[
                'group flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)]',
                'px-[var(--space-2)] py-[var(--space-1)] -mx-[var(--space-2)] -my-[var(--space-1)]',
                'transition-colors duration-[var(--duration-fast)]',
                isClickable
                  ? 'cursor-pointer hover:bg-[color-mix(in_oklch,var(--color-accent)_8%,transparent)]'
                  : 'cursor-default',
              ].join(' ')}
            >
              <span
                aria-hidden
                className={[
                  'flex h-6 w-6 items-center justify-center rounded-full border text-[0.75rem] font-medium',
                  'transition-colors duration-[var(--duration-fast)]',
                  isCurrent &&
                    'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-surface)]',
                  !isCurrent &&
                    isCompleted &&
                    'border-[var(--color-accent)] bg-[color-mix(in_oklch,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]',
                  !isCurrent &&
                    !isCompleted &&
                    'border-[var(--color-border)] text-[var(--color-ink-muted)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isCompleted ? '✓' : index + 1}
              </span>
              <span
                className={[
                  'hidden text-[var(--text-base)] sm:inline',
                  isCurrent
                    ? 'font-medium text-[var(--color-ink)]'
                    : isCompleted
                      ? 'text-[var(--color-ink)]'
                      : 'text-[var(--color-ink-muted)]',
                ].join(' ')}
              >
                {STEP_LABELS[step]}
              </span>
            </button>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={[
                  'h-px w-6 sm:w-12 transition-colors duration-[var(--duration-fast)]',
                  isCompleted ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]',
                ].join(' ')}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function WizardStartOver() {
  const router = useRouter();
  const reset = useWizardStore((s) => s.reset);

  function handleStartOver() {
    reset();
    router.push(stepPath('brief'));
  }

  return (
    <button
      type="button"
      onClick={handleStartOver}
      className="text-[var(--text-base)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] underline-offset-4 hover:underline transition-colors duration-[var(--duration-fast)]"
    >
      Start over
    </button>
  );
}

export function WizardAdvancedLinks() {
  return (
    <details className="text-[var(--text-base)] text-[var(--color-ink-muted)] group">
      <summary className="cursor-pointer list-none select-none hover:text-[var(--color-ink)] transition-colors duration-[var(--duration-fast)]">
        Advanced: prompt playgrounds
      </summary>
      <div className="mt-[var(--space-2)] flex flex-col gap-[var(--space-1)] pl-[var(--space-3)] border-l border-[var(--color-border)]">
        <Link
          href="/recommend-test"
          className="hover:text-[var(--color-accent)] transition-colors duration-[var(--duration-fast)]"
        >
          /recommend-test
        </Link>
        <Link
          href="/generate-test"
          className="hover:text-[var(--color-accent)] transition-colors duration-[var(--duration-fast)]"
        >
          /generate-test
        </Link>
      </div>
    </details>
  );
}
