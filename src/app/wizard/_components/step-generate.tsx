'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Recipe } from '@/lib/types';
import { useWizardStore } from '@/lib/wizard/store';

import { useGenerationStream, type GenerationStreamRequest } from '../_hooks/use-generation-stream';
import { RecipeSummaryChip } from './recipe-summary';
import { RefinePanel } from './refine-panel';

const MAX_ROUNDS = 3;

function recipeFingerprint(recipe: Recipe): string {
  return JSON.stringify({
    aestheticId: recipe.aesthetic.id,
    layoutId: recipe.layout.id,
    interactionId: recipe.interaction?.id ?? null,
    systemId: recipe.system?.id ?? null,
    brief: recipe.brief,
  });
}

interface IterateOverride {
  runKey: string;
  request: GenerationStreamRequest;
}

interface IterationContext {
  parentArtifactId: string;
  parentRound: number;
}

export function StepGenerate() {
  const selectedRecipe = useWizardStore((s) => s.selectedRecipe);
  const rounds = useWizardStore((s) => s.rounds);
  const activeArtifactId = useWizardStore((s) => s.activeArtifactId);
  const appendRound = useWizardStore((s) => s.appendRound);
  const setActiveArtifactId = useWizardStore((s) => s.setActiveArtifactId);

  const hasExistingRound = rounds.length > 0;

  const recipeKey = useMemo(
    () => (selectedRecipe ? recipeFingerprint(selectedRecipe) : ''),
    [selectedRecipe],
  );

  // Initial generate fires once on entry, when no rounds exist yet.
  const initialRunKey = hasExistingRound || !recipeKey ? '' : recipeKey;
  const initialRequest = useMemo<GenerationStreamRequest | null>(
    () =>
      selectedRecipe && !hasExistingRound ? { kind: 'generate', recipe: selectedRecipe } : null,
    [selectedRecipe, hasExistingRound],
  );

  // Iterate runs override the initial generate. Each Refine click bumps the
  // runKey to a fresh value so the dedup cache treats it as a new request.
  const [iterateOverride, setIterateOverride] = useState<IterateOverride | null>(null);

  // The parent metadata for the in-flight iteration. Lives in a ref because
  // it's set in an event handler and consumed in the done-effect — using
  // useState would force a setState inside the effect's success branch,
  // which the React lint rule rejects. Refs are the right fit: write where
  // appropriate, read on completion, clear after consumption.
  const iterationContextRef = useRef<IterationContext | null>(null);

  const activeRunKey = iterateOverride?.runKey ?? initialRunKey;
  const activeRequest = iterateOverride?.request ?? initialRequest;
  const isIteration = activeRunKey.startsWith('iterate:');

  const stream = useGenerationStream(activeRequest, activeRunKey);

  // Persist completed rounds to the store. Guards against double-append on
  // re-entry / StrictMode by checking the round set.
  useEffect(() => {
    if (stream.phase !== 'done') return;
    if (!stream.artifactId) return;
    if (rounds.some((r) => r.artifactId === stream.artifactId)) return;
    if (!selectedRecipe) return;

    const baseRecipe = `${selectedRecipe.aesthetic.name} × ${selectedRecipe.layout.name}`;
    const iterationCtx = iterationContextRef.current;

    if (iterationCtx) {
      const nextRound = iterationCtx.parentRound + 1;
      appendRound({
        artifactId: stream.artifactId,
        parentArtifactId: iterationCtx.parentArtifactId,
        iterationRound: nextRound,
        recipeSummary: `${baseRecipe} (iter ${nextRound})`,
        cost: stream.cost ?? 0,
        generatedAt: new Date().toISOString(),
      });
      iterationContextRef.current = null;
    } else {
      appendRound({
        artifactId: stream.artifactId,
        parentArtifactId: null,
        iterationRound: 0,
        recipeSummary: baseRecipe,
        cost: stream.cost ?? 0,
        generatedAt: new Date().toISOString(),
      });
    }
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

  const handleRefine = useCallback(
    (feedback: string) => {
      if (!selectedRecipe) return;
      const latest = rounds[rounds.length - 1];
      if (!latest) return;
      if (latest.iterationRound >= MAX_ROUNDS) return;

      // Parent metadata is captured here at submit time and threaded to the
      // done-effect via the ref. Each iteration overwrites the ref; the
      // done-effect clears it once the round is appended.
      iterationContextRef.current = {
        parentArtifactId: latest.artifactId,
        parentRound: latest.iterationRound,
      };
      setIterateOverride({
        runKey: `iterate:${latest.artifactId}:${Date.now()}`,
        request: {
          kind: 'iterate',
          recipe: selectedRecipe,
          previousArtifactId: latest.artifactId,
          feedback,
        },
      });
    },
    [selectedRecipe, rounds],
  );

  const latestRound = rounds[rounds.length - 1];
  const currentRoundIndex = latestRound?.iterationRound ?? 0;
  const isStreaming = stream.phase === 'streaming' || stream.phase === 'images';
  const rateLimited = stream.phase === 'error' && !!stream.error?.startsWith('429');

  const showLivePreview = isStreaming;
  const previewArtifactId = activeArtifactId ?? latestRound?.artifactId ?? null;
  const showStoredPreview = !showLivePreview && !!previewArtifactId && stream.phase !== 'error';
  const showError = stream.phase === 'error' && !rateLimited && !showStoredPreview;

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

      <StreamStatus
        phase={stream.phase}
        imageCount={stream.imageCount}
        hasExistingRound={hasExistingRound}
        isIteration={isIteration}
      />

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

        {showError ? <ErrorPane message={stream.error ?? 'unknown error'} /> : null}

        {!showLivePreview && !showStoredPreview && !showError ? <PreparingPane /> : null}
      </div>

      {stream.phase === 'done' && stream.usage ? (
        <p className="mt-[var(--space-4)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
          {stream.usage.inputTokens} in · {stream.usage.cacheReadTokens} cache ·{' '}
          {stream.usage.outputTokens} out · ${(stream.cost ?? 0).toFixed(3)}
          {stream.imagesInjected ? ` · ${stream.imagesInjected} images` : ''}
        </p>
      ) : null}

      {hasExistingRound ? (
        <div className="mt-[var(--space-8)]">
          <RefinePanel
            roundCount={currentRoundIndex}
            maxRounds={MAX_ROUNDS}
            disabled={isStreaming}
            rateLimited={rateLimited}
            onSubmit={handleRefine}
          />
        </div>
      ) : null}
    </section>
  );
}

interface StreamStatusProps {
  phase: 'idle' | 'streaming' | 'images' | 'done' | 'error';
  imageCount: number;
  hasExistingRound: boolean;
  isIteration: boolean;
}

function StreamStatus({ phase, imageCount, hasExistingRound, isIteration }: StreamStatusProps) {
  if (phase === 'streaming') {
    return (
      <Status pulse>
        {isIteration
          ? 'Streaming the iteration from Claude Opus…'
          : 'Streaming HTML from Claude Opus…'}
      </Status>
    );
  }
  if (phase === 'images') {
    return (
      <Status pulse>
        Compositing {imageCount} image{imageCount === 1 ? '' : 's'}…
      </Status>
    );
  }
  if (phase === 'done') {
    return <Status>{isIteration ? 'Iteration complete.' : 'Generation complete.'}</Status>;
  }
  if (hasExistingRound && phase === 'idle') {
    return <Status>Showing your latest round. Refine below to iterate.</Status>;
  }
  return null;
}

function Status({ children, pulse = false }: { children: React.ReactNode; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-[var(--space-3)]">
      <span
        aria-hidden
        className={[
          'block h-[6px] w-[6px] rounded-full bg-[var(--color-accent)]',
          pulse ? 'animate-pulse' : '',
        ].join(' ')}
      />
      <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">{children}</p>
    </div>
  );
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
