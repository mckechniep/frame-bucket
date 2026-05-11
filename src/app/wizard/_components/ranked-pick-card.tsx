'use client';

import type { RankedPick } from '@/lib/types';

interface RankedPickCardProps {
  pick: RankedPick;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}

export function RankedPickCard({ pick, rank, selected, onSelect }: RankedPickCardProps) {
  const confidence = Math.round(pick.confidence * 100);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'group block w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)]',
        'p-[var(--space-5)] text-left',
        'transition-all duration-[var(--duration-fast)]',
        selected
          ? 'border-[var(--color-accent)] shadow-[0_0_0_1px_var(--color-accent)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-[var(--color-accent)]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-[var(--space-4)]">
        <div className="flex items-baseline gap-[var(--space-3)]">
          <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
            {rank.toString().padStart(2, '0')}
          </span>
          <h3 className="font-[family-name:var(--font-display)] text-[var(--text-xl)] tracking-tight text-[var(--color-ink)]">
            {pick.entryName}
          </h3>
        </div>
        <span
          className={[
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
            'transition-colors duration-[var(--duration-fast)]',
            selected
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-surface)]'
              : 'border-[var(--color-border)] group-hover:border-[var(--color-ink-muted)]',
          ].join(' ')}
          aria-hidden
        >
          {selected ? <CheckIcon /> : null}
        </span>
      </div>

      <div className="mt-[var(--space-4)] flex items-center gap-[var(--space-3)]">
        <div
          className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--color-border)]"
          role="presentation"
        >
          <div
            className={[
              'h-full rounded-full transition-[width] duration-[var(--duration-slow)]',
              selected ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ink)]',
            ].join(' ')}
            style={{ width: `${confidence}%` }}
          />
        </div>
        <span className="min-w-[3ch] font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
          {confidence}%
        </span>
      </div>

      <p className="mt-[var(--space-4)] text-[var(--text-base)] leading-relaxed text-[var(--color-ink-muted)]">
        {pick.reasoning}
      </p>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6.5L5 9L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
