'use client';

import { useRouter } from 'next/navigation';

import { stepPath } from '@/lib/wizard/steps';
import { useWizardStore } from '@/lib/wizard/store';

export function RecipeSummaryChip() {
  const router = useRouter();
  const selectedRecipe = useWizardStore((s) => s.selectedRecipe);

  if (!selectedRecipe) return null;

  const { brief, aesthetic, layout, interaction, system } = selectedRecipe;
  const extras = [interaction?.name, system?.name].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={() => router.push(stepPath('recommend'))}
      aria-label="Edit recipe — return to recommendations"
      className={[
        'group flex max-w-full items-center gap-[var(--space-4)] rounded-[var(--radius-md)]',
        'border border-[var(--color-border)] bg-[var(--color-surface)]',
        'px-[var(--space-4)] py-[var(--space-3)]',
        'text-left transition-colors duration-[var(--duration-fast)]',
        'hover:border-[var(--color-ink-muted)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-[var(--color-accent)]',
      ].join(' ')}
    >
      <span
        aria-hidden
        className="block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--color-accent)]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)]">
        <span className="truncate font-[family-name:var(--font-display)] text-[var(--text-lg)] tracking-tight">
          {aesthetic.name} <span className="text-[var(--color-ink-muted)]">×</span> {layout.name}
        </span>
        <span className="truncate text-[var(--text-base)] text-[var(--color-ink-muted)]">
          {brief.projectName}
          {extras.length > 0 ? ` · ${extras.join(' · ')}` : ''}
        </span>
      </span>
      <span
        aria-hidden
        className="shrink-0 text-[var(--text-base)] text-[var(--color-ink-muted)] transition-colors duration-[var(--duration-fast)] group-hover:text-[var(--color-ink)]"
      >
        Edit ↗
      </span>
    </button>
  );
}
