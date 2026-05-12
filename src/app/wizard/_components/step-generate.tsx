'use client';

import { useEffect, useMemo } from 'react';

import type { Recipe } from '@/lib/types';
import { useWizardStore } from '@/lib/wizard/store';

import { useGenerationStream } from '../_hooks/use-generation-stream';
import { RecipeSummaryChip } from './recipe-summary';

function recipeFingerprint(recipe: Recipe): string {
  return JSON.stringify({
    aestheticId: recipe.aesthetic.id,
    layoutId: recipe.layout.id,
    interactionId: recipe.interaction?.id ?? null,
    systemId: recipe.system?.id ?? null,
    brief: recipe.brief,
  });
}

export function StepGenerate() {
  const selectedRecipe = useWizardStore((s) => s.selectedRecipe);
  const rounds = useWizardStore((s) => s.rounds);
  const activeArtifactId = useWizardStore((s) => s.activeArtifactId);
  const appendRound = useWizardStore((s) => s.appendRound);
  const setActiveArtifactId = useWizardStore((s) => s.setActiveArtifactId);

  // Has any round been generated yet for this recipe? Existing rounds short-
  // circuit the auto-generate effect so re-entering the step never re-spends
  // tokens on a result we already have.
  const hasExistingRound = rounds.length > 0;

  // Stable primitive fingerprint of the recipe — used as the dedup key and
  // as the effect dep (Rule 2: primitives only).
  const recipeKey = useMemo(
    () => (selectedRecipe ? recipeFingerprint(selectedRecipe) : ''),
    [selectedRecipe],
  );

  const runKey = hasExistingRound || !recipeKey ? '' : recipeKey;

  const streamRequest = useMemo(
    () => (selectedRecipe ? { kind: 'generate' as const, recipe: selectedRecipe } : null),
    [selectedRecipe],
  );

  const stream = useGenerationStream(streamRequest, runKey);

  // When the stream completes, persist the round to the store. Guards
  // against double-append if the effect re-runs (StrictMode, navigation
  // round-trip) by checking the round set.
  useEffect(() => {
    if (stream.phase !== 'done') return;
    if (!stream.artifactId) return;
    if (rounds.some((r) => r.artifactId === stream.artifactId)) return;
    if (!selectedRecipe) return;
    appendRound({
      artifactId: stream.artifactId,
      parentArtifactId: null,
      iterationRound: 0,
      recipeSummary: `${selectedRecipe.aesthetic.name} × ${selectedRecipe.layout.name}`,
      cost: stream.cost ?? 0,
      generatedAt: new Date().toISOString(),
    });
    setActiveArtifactId(stream.artifactId);
  }, [
    stream.phase,
    stream.artifactId,
    stream.cost,
    rounds,
    selectedRecipe,
    appendRound,
    setActiveArtifactId,
  ]);

  // Decide what the preview pane shows:
  //  - Live iframe (srcDoc) while streaming or compositing images
  //  - Stable /preview/<id> iframe once a round exists in the store
  //  - Error pane on failure
  const showLivePreview = stream.phase === 'streaming' || stream.phase === 'images';
  const previewArtifactId =
    activeArtifactId ?? (rounds.length > 0 ? rounds[rounds.length - 1]?.artifactId : null) ?? null;
  const showStoredPreview = !showLivePreview && !!previewArtifactId && stream.phase !== 'error';

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

      <StreamStatus stream={stream} hasExistingRound={hasExistingRound} />

      <div className="mt-[var(--space-6)]">
        {showLivePreview ? (
          <iframe
            key="live"
            sandbox="allow-scripts"
            srcDoc={stream.html}
            className="h-[720px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white"
            title="Live generation preview"
          />
        ) : null}

        {showStoredPreview ? (
          <iframe
            key={previewArtifactId}
            src={`/preview/${previewArtifactId}`}
            sandbox="allow-scripts"
            className="h-[720px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white"
            title="Generated artifact preview"
          />
        ) : null}

        {stream.phase === 'error' && !showStoredPreview ? (
          <ErrorPane message={stream.error ?? 'unknown error'} />
        ) : null}

        {!showLivePreview && !showStoredPreview && stream.phase !== 'error' ? (
          <PreparingPane />
        ) : null}
      </div>

      {stream.phase === 'done' && stream.usage ? (
        <p className="mt-[var(--space-4)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
          {stream.usage.inputTokens} in · {stream.usage.cacheReadTokens} cache ·{' '}
          {stream.usage.outputTokens} out · ${(stream.cost ?? 0).toFixed(3)}
          {stream.imagesInjected ? ` · ${stream.imagesInjected} images` : ''}
        </p>
      ) : null}
    </section>
  );
}

function StreamStatus({
  stream,
  hasExistingRound,
}: {
  stream: ReturnType<typeof useGenerationStream>;
  hasExistingRound: boolean;
}) {
  if (hasExistingRound && stream.phase === 'idle') {
    return (
      <div className="flex items-center gap-[var(--space-3)]">
        <span aria-hidden className="block h-[6px] w-[6px] rounded-full bg-[var(--color-accent)]" />
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          Showing your previous generation. Iterate on it from the Refine panel below (lands in Task
          9).
        </p>
      </div>
    );
  }
  if (stream.phase === 'streaming') {
    return (
      <div className="flex items-center gap-[var(--space-3)]">
        <span
          aria-hidden
          className="block h-[6px] w-[6px] animate-pulse rounded-full bg-[var(--color-accent)]"
        />
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          Streaming HTML from Claude Opus…
        </p>
      </div>
    );
  }
  if (stream.phase === 'images') {
    return (
      <div className="flex items-center gap-[var(--space-3)]">
        <span
          aria-hidden
          className="block h-[6px] w-[6px] animate-pulse rounded-full bg-[var(--color-accent)]"
        />
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          Compositing {stream.imageCount} image{stream.imageCount === 1 ? '' : 's'}…
        </p>
      </div>
    );
  }
  if (stream.phase === 'done') {
    return (
      <div className="flex items-center gap-[var(--space-3)]">
        <span aria-hidden className="block h-[6px] w-[6px] rounded-full bg-[var(--color-accent)]" />
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
          Generation complete.
        </p>
      </div>
    );
  }
  return null;
}

function PreparingPane() {
  return (
    <div className="flex h-[720px] w-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)]">
      <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">Preparing stream…</p>
    </div>
  );
}

function ErrorPane({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklch,oklch(55%_0.18_25)_50%,var(--color-border))] bg-[color-mix(in_oklch,oklch(55%_0.18_25)_5%,transparent)] p-[var(--space-6)]">
      <h3 className="font-[family-name:var(--font-display)] text-[var(--text-xl)] tracking-tight">
        Generation failed.
      </h3>
      <p className="mt-[var(--space-2)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
        {message}
      </p>
      <p className="mt-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
        Navigate away and come back to retry, or click &ldquo;Start over&rdquo; in the footer.
      </p>
    </div>
  );
}
