'use client';

import { useWizardStore, type WizardRound } from '@/lib/wizard/store';

import { PagePreviewFrame } from './page-preview-frame';

function paneLabel(round: WizardRound | undefined): string {
  if (!round) return '';
  if (round.checkpointName) return round.checkpointName;
  if (round.iterationRound === 0) return 'Original';
  return `Round ${round.iterationRound}`;
}

interface SideBySidePreviewProps {
  activeArtifactId: string;
  compareArtifactId: string;
}

export function SideBySidePreview({ activeArtifactId, compareArtifactId }: SideBySidePreviewProps) {
  const rounds = useWizardStore((s) => s.rounds);
  const setCompareWithArtifactId = useWizardStore((s) => s.setCompareWithArtifactId);

  const compareRound = rounds.find((r) => r.artifactId === compareArtifactId);
  const activeRound = rounds.find((r) => r.artifactId === activeArtifactId);

  return (
    <div className="grid grid-cols-1 gap-[var(--space-4)] xl:grid-cols-2">
      <PreviewPane
        artifactId={compareArtifactId}
        round={compareRound}
        roleLabel="Compare"
        onClose={() => setCompareWithArtifactId(null)}
      />
      <PreviewPane artifactId={activeArtifactId} round={activeRound} roleLabel="Active" />
    </div>
  );
}

interface PreviewPaneProps {
  artifactId: string;
  round: WizardRound | undefined;
  roleLabel: string;
  onClose?: () => void;
}

function PreviewPane({ artifactId, round, roleLabel, onClose }: PreviewPaneProps) {
  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <header className="flex items-baseline justify-between gap-[var(--space-3)]">
        <div className="flex items-baseline gap-[var(--space-2)]">
          <span className="text-[var(--text-base)] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
            {roleLabel}
          </span>
          <span className="font-[family-name:var(--font-display)] text-[var(--text-lg)] tracking-tight">
            {paneLabel(round)}
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Stop comparing"
            className="text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
          >
            ×
          </button>
        ) : null}
      </header>
      <PagePreviewFrame artifactId={artifactId} title={`Preview: ${paneLabel(round)}`} />
    </div>
  );
}
