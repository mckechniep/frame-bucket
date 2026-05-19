'use client';

import { useState } from 'react';

import { useWizardStore, type WizardRound } from '@/lib/wizard/store';

import { CheckpointNameModal } from './checkpoint-name-modal';

function roundLabel(round: WizardRound): string {
  if (round.checkpointName) return round.checkpointName;
  if (round.iterationRound === 0) return 'Original';
  return `Round ${round.iterationRound}`;
}

function formatGeneratedAt(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function IterationHistory() {
  const rounds = useWizardStore((s) => s.rounds);
  const activeArtifactId = useWizardStore((s) => s.activeArtifactId);
  const compareWithArtifactId = useWizardStore((s) => s.compareWithArtifactId);
  const setActiveArtifactId = useWizardStore((s) => s.setActiveArtifactId);
  const setCompareWithArtifactId = useWizardStore((s) => s.setCompareWithArtifactId);

  const [namingArtifactId, setNamingArtifactId] = useState<string | null>(null);

  if (rounds.length === 0) return null;

  // The effective active id falls back to the latest round if none is set —
  // matches step-generate's preview-pane fallback logic.
  const effectiveActiveId = activeArtifactId ?? rounds[rounds.length - 1]!.artifactId;

  const namingRound = namingArtifactId
    ? (rounds.find((r) => r.artifactId === namingArtifactId) ?? null)
    : null;

  return (
    <aside
      aria-label="Iteration history"
      className="flex flex-col gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-5)]"
    >
      <header className="flex items-baseline justify-between gap-[var(--space-3)]">
        <h2 className="font-[family-name:var(--font-display)] text-[var(--text-xl)] tracking-tight text-[var(--color-ink)]">
          History
        </h2>
        <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
          {rounds.length}
        </span>
      </header>

      <ol className="flex flex-col gap-[var(--space-2)]">
        {rounds.map((round) => {
          const isActive = round.artifactId === effectiveActiveId;
          const isComparing = compareWithArtifactId === round.artifactId;
          return (
            <li
              key={round.artifactId}
              className={[
                'rounded-[var(--radius-md)] border transition-colors duration-[var(--duration-fast)]',
                isActive
                  ? 'border-[var(--color-accent)] bg-[color-mix(in_oklch,var(--color-accent)_8%,transparent)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => setActiveArtifactId(round.artifactId)}
                aria-current={isActive ? 'true' : undefined}
                disabled={isActive}
                className={[
                  'block w-full px-[var(--space-4)] py-[var(--space-3)] text-left',
                  isActive ? 'cursor-default' : 'cursor-pointer',
                ].join(' ')}
              >
                <div className="flex items-baseline justify-between gap-[var(--space-3)]">
                  <span className="font-[family-name:var(--font-display)] text-[var(--text-lg)] tracking-tight text-[var(--color-ink)]">
                    {roundLabel(round)}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-[var(--text-base)] tabular-nums text-[var(--color-ink-muted)]">
                    ${round.cost.toFixed(3)}
                  </span>
                </div>
                <div className="mt-[var(--space-1)] flex items-baseline justify-between gap-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
                  <span>
                    {round.iterationRound === 0
                      ? 'Initial generation'
                      : `Iteration ${round.iterationRound}`}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {formatGeneratedAt(round.generatedAt)}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-[var(--space-2)] border-t border-[var(--color-border)] px-[var(--space-4)] py-[var(--space-2)]">
                <button
                  type="button"
                  onClick={() => setNamingArtifactId(round.artifactId)}
                  className="flex items-center gap-[var(--space-1)] text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-ink)] hover:underline"
                >
                  <PencilIcon />
                  {round.checkpointName ? 'Rename' : 'Name'}
                </button>
                {!isActive ? (
                  <button
                    type="button"
                    onClick={() => setCompareWithArtifactId(isComparing ? null : round.artifactId)}
                    aria-pressed={isComparing}
                    className={[
                      'ml-auto text-[var(--text-base)] underline-offset-4 transition-colors duration-[var(--duration-fast)]',
                      isComparing
                        ? 'text-[var(--color-accent)] hover:underline'
                        : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline',
                    ].join(' ')}
                  >
                    {isComparing ? 'Stop compare' : 'Compare'}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {namingRound ? (
        <CheckpointNameModal round={namingRound} onClose={() => setNamingArtifactId(null)} />
      ) : null}
    </aside>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M8.5 1.5L10.5 3.5M2 10L1.5 12L3.5 11.5L10 5L7 2L2 10Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
