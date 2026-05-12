'use client';

import { RecipeSummaryChip } from './recipe-summary';

export function StepGenerate() {
  return (
    <section className="mx-auto max-w-[1400px] px-[var(--space-8)] py-[var(--space-12)]">
      <header className="mb-[var(--space-8)] flex flex-col gap-[var(--space-6)] sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[var(--text-base)] uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
            Step 3 of 3
          </p>
          <h1 className="mt-[var(--space-3)] font-[family-name:var(--font-display)] text-[var(--text-hero)] leading-[1.05] tracking-tight">
            Generate.
          </h1>
        </div>
        <div className="sm:max-w-[480px] sm:flex-1">
          <RecipeSummaryChip />
        </div>
      </header>
      <p className="text-[var(--color-ink-muted)]">
        Streaming generation, iteration history, and side-by-side preview land in Task 8 onward.
      </p>
    </section>
  );
}
