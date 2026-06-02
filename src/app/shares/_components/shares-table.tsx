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
      className={['flex flex-col gap-[var(--space-4)]', muted ? 'opacity-75' : ''].join(' ')}
    >
      <header className="flex items-baseline gap-[var(--space-4)]">
        <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] tracking-tight text-[var(--color-ink)]">
          {label}
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
          {count} {count === 1 ? 'share' : 'shares'}
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
      className="flex flex-col items-start gap-[var(--space-4)] rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-[var(--space-12)]"
    >
      <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        Empty
      </span>
      <p className="max-w-[44ch] font-[family-name:var(--font-display)] text-[var(--text-2xl)] tracking-tight text-[var(--color-ink)]">
        No share links yet.
      </p>
      <p className="max-w-[60ch] text-[var(--text-base)] leading-relaxed text-[var(--color-ink-muted)]">
        Generate an artifact in the wizard, then look for the “Create share link” button on the
        Finish panel. Links you create will appear here.
      </p>
    </section>
  );
}
