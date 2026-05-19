'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  RankedPick,
  Recipe,
  RecommendationResult,
  Taxonomy,
  TaxonomyEntry,
} from '@/lib/types';
import { dedupedRequest } from '@/lib/wizard/deduped-request';
import { stepPath } from '@/lib/wizard/steps';
import { useWizardStore } from '@/lib/wizard/store';

import { RankedPickCard } from './ranked-pick-card';

interface RecommendResponse {
  recommendation: RecommendationResult;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  cost: number;
}

interface StepRecommendProps {
  taxonomy: Taxonomy | null;
}

export function StepRecommend({ taxonomy }: StepRecommendProps) {
  const router = useRouter();

  const brief = useWizardStore((s) => s.brief);
  const recommendation = useWizardStore((s) => s.recommendation);
  const selectedRecipe = useWizardStore((s) => s.selectedRecipe);
  const setRecommendation = useWizardStore((s) => s.setRecommendation);
  const setSelectedRecipe = useWizardStore((s) => s.setSelectedRecipe);

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);

  // Local selection state — committed to the store only on "Generate" click.
  // Pre-fill from any existing selectedRecipe so navigating away and back
  // restores prior picks.
  const [aestheticId, setAestheticId] = useState<string | null>(
    selectedRecipe?.aesthetic.id ?? null,
  );
  const [layoutId, setLayoutId] = useState<string | null>(selectedRecipe?.layout.id ?? null);
  const [interactionId, setInteractionId] = useState<string | null>(
    selectedRecipe?.interaction?.id ?? null,
  );
  const [systemId, setSystemId] = useState<string | null>(selectedRecipe?.system?.id ?? null);

  // briefKey is a primitive (Rule 2): the effect depends on the brief's
  // *content*, not its object reference. Computed each render but only
  // changes when the brief actually changes.
  const briefKey = useMemo(() => (brief ? JSON.stringify(brief) : ''), [brief]);

  useEffect(() => {
    if (!briefKey) return;
    // Imperative read — bail without making `recommendation` a dep, which
    // would re-fire the effect whenever the fetch resolves and writes to it.
    if (useWizardStore.getState().recommendation) return;

    let cancelled = false;

    const { promise, release } = dedupedRequest<RecommendResponse>(
      `recommend:${briefKey}`,
      async (signal) => {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: briefKey,
          signal,
        });
        if (!res.ok) {
          // The route returns structured error JSON: { error, detail?, issues? }
          // Surface detail + issues if present so the error pane is diagnosable
          // without inspecting raw 500-char model output.
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            detail?: string;
            issues?: Array<{ path: string; message: string }>;
          } | null;
          const parts: string[] = [];
          if (body?.detail) parts.push(body.detail);
          if (body?.issues && body.issues.length > 0) {
            parts.push(
              'Issues: ' + body.issues.map((i) => `${i.path || '<root>'}: ${i.message}`).join('; '),
            );
          }
          const message = parts.length > 0 ? parts.join(' — ') : (body?.error ?? res.statusText);
          throw new Error(`${res.status} — ${message}`);
        }
        return res.json() as Promise<RecommendResponse>;
      },
    );

    promise
      .then((data) => {
        if (cancelled) return;
        setRecommendation(data.recommendation);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setFetchError(err instanceof Error ? err.message : 'unknown error');
      });

    return () => {
      cancelled = true;
      release();
    };
  }, [briefKey, setRecommendation, retryCounter]);

  function handleRetry() {
    setRecommendation(null);
    setFetchError(null);
    setRetryCounter((n) => n + 1);
  }

  function handleGenerate() {
    if (!brief || !recommendation || !taxonomy) return;
    if (!aestheticId || !layoutId) return;

    const aesthetic = taxonomy.aesthetics.find((e) => e.id === aestheticId);
    const layout = taxonomy.layouts.find((e) => e.id === layoutId);
    const interaction = interactionId
      ? taxonomy.interactions.find((e) => e.id === interactionId)
      : undefined;
    const system = systemId ? taxonomy.systems.find((e) => e.id === systemId) : undefined;
    if (!aesthetic || !layout) return;

    const recipe: Recipe = {
      brief,
      aesthetic,
      layout,
      ...(interaction ? { interaction } : {}),
      ...(system ? { system } : {}),
    };
    setSelectedRecipe(recipe);
    router.push(stepPath('generate'));
  }

  const canGenerate = aestheticId !== null && layoutId !== null;
  // isFetching is derived rather than stored — avoids setState-in-effect-body
  // (the React lint rule rejects it) and prevents a stale "is loading" flag.
  const isFetching = !recommendation && !fetchError && !!briefKey;

  return (
    <section className="mx-auto max-w-[1100px] px-[var(--space-8)] py-[var(--space-12)]">
      <header className="mb-[var(--space-12)]">
        <p className="text-[var(--text-base)] uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
          Step 2 of 3
        </p>
        <h1 className="mt-[var(--space-3)] font-[family-name:var(--font-display)] text-[var(--text-hero)] leading-[1.05] tracking-tight">
          Pick a direction.
        </h1>
        <p className="mt-[var(--space-4)] max-w-[60ch] text-[var(--text-lg)] leading-relaxed text-[var(--color-ink-muted)]">
          We ranked candidates against your brief. Choose one aesthetic and one layout to start.
          Interactions and systems are optional — add them if the brief calls for it.
        </p>
      </header>

      {isFetching && !recommendation ? <LoadingState /> : null}
      {fetchError && !isFetching ? <ErrorState message={fetchError} onRetry={handleRetry} /> : null}

      {recommendation ? (
        <div className="space-y-[var(--space-12)]">
          <BucketSection
            label="Aesthetic"
            sublabel="The visual feel — typography, palette, composition language."
            required
            picks={recommendation.aesthetics}
            entries={taxonomy?.aesthetics ?? []}
            selectedId={aestheticId}
            onSelect={setAestheticId}
            openByDefault
          />
          <BucketSection
            label="Layout"
            sublabel="The spatial system — grids, scroll behavior, hierarchy."
            required
            picks={recommendation.layouts}
            entries={taxonomy?.layouts ?? []}
            selectedId={layoutId}
            onSelect={setLayoutId}
            openByDefault
          />
          <BucketSection
            label="Interaction"
            sublabel="Optional. Motion, microcopy, transitions."
            required={false}
            picks={recommendation.interactions}
            entries={taxonomy?.interactions ?? []}
            selectedId={interactionId}
            onSelect={setInteractionId}
            openByDefault={recommendation.interactions.length > 0}
          />
          <BucketSection
            label="System"
            sublabel="Optional. Underlying systems — pricing, scheduling, dashboards."
            required={false}
            picks={recommendation.systems}
            entries={taxonomy?.systems ?? []}
            selectedId={systemId}
            onSelect={setSystemId}
            openByDefault={recommendation.systems.length > 0}
          />

          <div className="sticky bottom-0 -mx-[var(--space-8)] flex items-center justify-between gap-[var(--space-4)] border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-[var(--space-8)] py-[var(--space-4)] backdrop-blur">
            <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
              {canGenerate
                ? 'Aesthetic and layout selected. Ready to generate.'
                : 'Select an aesthetic and a layout to continue.'}
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={[
                'inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)]',
                'px-[var(--space-6)] py-[var(--space-3)]',
                'text-[var(--text-base)] font-medium',
                'transition-transform duration-[var(--duration-fast)]',
                canGenerate
                  ? 'bg-[var(--color-accent)] text-[var(--color-surface)] hover:-translate-y-px'
                  : 'cursor-not-allowed bg-[var(--color-border)] text-[var(--color-ink-muted)]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--color-ink)]',
              ].join(' ')}
            >
              Generate
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface BucketSectionProps {
  label: string;
  sublabel: string;
  required: boolean;
  picks: RankedPick[];
  entries: TaxonomyEntry[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  openByDefault: boolean;
}

function BucketSection({
  label,
  sublabel,
  required,
  picks,
  entries,
  selectedId,
  onSelect,
  openByDefault,
}: BucketSectionProps) {
  // If a selection lives outside the ranked picks, it's an override —
  // show it as a small chip above the override picker.
  const selectedIsPick = picks.some((p) => p.entryId === selectedId);
  const overrideEntry =
    selectedId && !selectedIsPick ? entries.find((e) => e.id === selectedId) : null;

  return (
    <details open={openByDefault} className="group">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-[var(--space-4)] border-b border-[var(--color-border)] pb-[var(--space-3)]">
        <div className="flex items-baseline gap-[var(--space-4)]">
          <h2 className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] tracking-tight text-[var(--color-ink)]">
            {label}
          </h2>
          {!required ? (
            <span className="text-[var(--text-base)] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
              Optional
            </span>
          ) : null}
        </div>
        <span
          aria-hidden
          className="text-[var(--text-base)] text-[var(--color-ink-muted)] transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <p className="mt-[var(--space-3)] max-w-[60ch] text-[var(--text-base)] text-[var(--color-ink-muted)]">
        {sublabel}
      </p>

      {picks.length === 0 ? (
        <p className="mt-[var(--space-6)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
          The recommender did not surface picks here for this brief. Use the override below if you
          want to add one anyway.
        </p>
      ) : (
        <ul className="mt-[var(--space-6)] grid grid-cols-1 gap-[var(--space-3)] md:grid-cols-2">
          {picks.map((pick, index) => (
            <li key={pick.entryId}>
              <RankedPickCard
                pick={pick}
                rank={index + 1}
                selected={selectedId === pick.entryId}
                onSelect={() => onSelect(pick.entryId)}
              />
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 ? (
        <details className="mt-[var(--space-6)]">
          <summary className="cursor-pointer text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline">
            {overrideEntry
              ? `Override: ${overrideEntry.name} — change`
              : 'Or pick manually from all entries'}
          </summary>
          <div className="mt-[var(--space-3)] space-y-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-[var(--space-4)]">
            <select
              value={overrideEntry?.id ?? ''}
              onChange={(e) => onSelect(e.target.value || null)}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-base)]"
            >
              <option value="">— Pick from full taxonomy —</option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.hasOverride ? ' ●' : ''}
                </option>
              ))}
            </select>
            {overrideEntry ? (
              <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
                {overrideEntry.shortDefinition}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      {!required && selectedId ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mt-[var(--space-3)] text-[var(--text-base)] text-[var(--color-ink-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
        >
          Clear selection
        </button>
      ) : null}
    </details>
  );
}

function LoadingState() {
  return (
    <div className="space-y-[var(--space-6)]">
      <div className="flex items-center gap-[var(--space-3)]">
        <span
          aria-hidden
          className="block h-[6px] w-[6px] animate-pulse rounded-full bg-[var(--color-accent)]"
        />
        <p className="text-[var(--text-lg)] text-[var(--color-ink-muted)]">
          Asking the recommender to read your brief…
        </p>
      </div>
      <div className="grid grid-cols-1 gap-[var(--space-3)] md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            aria-hidden
            className="h-[140px] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]"
            style={{ animationDelay: `${i * 75}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklch,oklch(55%_0.18_25)_50%,var(--color-border))] bg-[color-mix(in_oklch,oklch(55%_0.18_25)_5%,transparent)] p-[var(--space-6)]">
      <h3 className="font-[family-name:var(--font-display)] text-[var(--text-xl)] tracking-tight">
        The recommender failed.
      </h3>
      <p className="mt-[var(--space-2)] font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-ink)] bg-transparent px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-base)] text-[var(--color-ink)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-ink)] hover:text-[var(--color-surface)]"
      >
        Try again
      </button>
    </div>
  );
}
