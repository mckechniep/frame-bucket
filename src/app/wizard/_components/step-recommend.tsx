'use client';

import type { Taxonomy } from '@/lib/types';

interface StepRecommendProps {
  taxonomy: Taxonomy | null;
}

export function StepRecommend({ taxonomy: _taxonomy }: StepRecommendProps) {
  return (
    <section className="mx-auto max-w-[1100px] px-[var(--space-8)] py-[var(--space-12)]">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-3xl)] tracking-tight">
        Recommendations
      </h1>
      <p className="mt-[var(--space-4)] text-[var(--color-ink-muted)]">
        Step component stub — filled in by Task 6.
      </p>
    </section>
  );
}
