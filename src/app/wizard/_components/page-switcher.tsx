'use client';

import type { WizardPage } from '@/lib/wizard/store';

interface PageSwitcherProps {
  pages: WizardPage[];
  activeSlug: string;
  onSwitch: (slug: string) => void;
  onAddPage: () => void;
  /** When true, all page-switch and add-page interactions are disabled. */
  disabled?: boolean;
}

export function PageSwitcher({
  pages,
  activeSlug,
  onSwitch,
  onAddPage,
  disabled = false,
}: PageSwitcherProps) {
  // Hidden before generation produces any pages.
  if (pages.length === 0) return null;

  // Pages arrive pre-sorted from the store (setSite/addPage both sort by position).

  return (
    <nav
      aria-label="Site pages"
      className="flex items-center gap-[var(--space-2)] overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-[var(--space-4)] py-[var(--space-2)]"
    >
      {pages.map((page) => {
        const isActive = page.slug === activeSlug;
        return (
          <button
            key={page.slug}
            type="button"
            onClick={() => onSwitch(page.slug)}
            disabled={disabled}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'shrink-0 rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.12em] transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50',
              isActive
                ? 'text-[var(--color-accent)] underline underline-offset-4'
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
            ].join(' ')}
          >
            {page.title}
          </button>
        );
      })}

      <span aria-hidden className="mx-[var(--space-1)] h-4 w-px bg-[var(--color-border)]" />

      <button
        type="button"
        onClick={onAddPage}
        disabled={disabled}
        className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-[var(--space-3)] py-[var(--space-1)] font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.12em] text-[var(--color-ink-muted)] transition-all duration-[var(--duration-fast)] hover:-translate-y-px hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Add page
      </button>
    </nav>
  );
}
