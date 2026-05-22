'use client';

import type { ShareRecord } from '@/lib/shares/share-store';
import { ShareRow } from './share-row';

interface SharesTableProps {
  shares: ShareRecord[];
}

export function SharesTable({ shares }: SharesTableProps) {
  if (shares.length === 0) {
    return <EmptyState />;
  }

  // Active first, revoked at the bottom — per Task 17 plan. The API already
  // returns newest-first, so we preserve that order within each group.
  const active = shares.filter((s) => !s.revokedAt);
  const revoked = shares.filter((s) => s.revokedAt);

  return (
    <div className="flex flex-col gap-[var(--space-8)]">
      {active.length > 0 ? (
        <ShareSection label="Active" count={active.length} shares={active} />
      ) : (
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          No active share links. Revoked links are below.
        </p>
      )}

      {revoked.length > 0 ? (
        <ShareSection label="Revoked" count={revoked.length} shares={revoked} muted />
      ) : null}
    </div>
  );
}

interface ShareSectionProps {
  label: string;
  count: number;
  shares: ShareRecord[];
  muted?: boolean;
}

function ShareSection({ label, count, shares, muted }: ShareSectionProps) {
  return (
    <section
      aria-label={`${label} shares`}
      className={['flex flex-col gap-[var(--space-3)]', muted ? 'opacity-80' : ''].join(' ')}
    >
      <header className="flex items-baseline justify-between gap-[var(--space-3)] border-b border-[var(--color-border)] pb-[var(--space-2)]">
        <h2 className="font-[family-name:var(--font-display)] text-[var(--text-xl)] tracking-tight text-[var(--color-ink)]">
          {label}
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
          {count}
        </span>
      </header>

      <ul className="flex flex-col gap-[var(--space-2)]">
        {shares.map((share) => (
          <ShareRow key={share.token} share={share} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <section
      aria-label="No shares yet"
      className="flex flex-col items-start gap-[var(--space-3)] rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-[var(--space-8)]"
    >
      <p className="font-[family-name:var(--font-display)] text-[var(--text-xl)] tracking-tight text-[var(--color-ink)]">
        No shares yet.
      </p>
      <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
        Create one from the Finish panel after generating an artifact.
      </p>
    </section>
  );
}
