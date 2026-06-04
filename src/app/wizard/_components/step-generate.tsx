'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Recipe } from '@/lib/types';
import { useWizardStore } from '@/lib/wizard/store';

import { useGenerationStream, type GenerationStreamRequest } from '../_hooks/use-generation-stream';
import { useSharesList } from '../_hooks/use-shares-list';
import { AddPageModal } from './add-page-modal';
import { CreateShareModal } from './create-share-modal';
import { IterationHistory } from './iteration-history';
import { PagePreviewFrame } from './page-preview-frame';
import { PageSwitcher } from './page-switcher';
import { RecipeSummaryChip } from './recipe-summary';
import { RefinePanel } from './refine-panel';
import { SideBySidePreview } from './side-by-side-preview';

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
  targetSlug: string;
}

export function StepGenerate() {
  const selectedRecipe = useWizardStore((s) => s.selectedRecipe);
  const rounds = useWizardStore((s) => s.rounds);
  const activeArtifactId = useWizardStore((s) => s.activeArtifactId);
  const compareWithArtifactId = useWizardStore((s) => s.compareWithArtifactId);
  const appendRound = useWizardStore((s) => s.appendRound);
  const setActiveArtifactId = useWizardStore((s) => s.setActiveArtifactId);
  const setSite = useWizardStore((s) => s.setSite);
  const addPage = useWizardStore((s) => s.addPage);
  const setActiveSlug = useWizardStore((s) => s.setActiveSlug);
  const setPageArtifact = useWizardStore((s) => s.setPageArtifact);
  const siteId = useWizardStore((s) => s.siteId);
  const pages = useWizardStore((s) => s.pages);
  const activeSlug = useWizardStore((s) => s.activeSlug);

  const [addPageOpen, setAddPageOpen] = useState(false);

  // The preview gate below keys off the *main* generation stream's phase. When
  // that stream is in 'error' (a failed generate/refine), it must not blank the
  // canvas for an artifact the user has since chosen via page-switch or a
  // successful add-page (those run a *different* stream). This flag lets such a
  // navigation supersede the stale error; a fresh refine resets it so the new
  // attempt's own error can surface again.
  const [staleErrorDismissed, setStaleErrorDismissed] = useState(false);

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
  const { shares, refresh: refreshShares } = useSharesList();

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
      // Advance the active page's stored artifact pointer so switching away
      // from and back to this page shows the iterated artifact, not the original.
      // Use the slug captured at submit time (iterationCtx.targetSlug) — not
      // the live activeSlug — to guard against the user switching pages while
      // the stream is in-flight (stale-closure bug).
      setPageArtifact(iterationCtx.targetSlug, stream.artifactId);
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
    // Establish the site and its initial landing page on first generation.
    // setSite replaces the old setSiteId call — it atomically sets siteId,
    // pages ([{ slug:'/', title:'Home', artifactId, position:0 }]), and
    // resets activeSlug to '/'. Only fires when siteId + artifactId are both
    // present AND no pages exist yet (guards against double-init on re-entry).
    if (stream.siteId && stream.artifactId && pages.length === 0) {
      setSite(stream.siteId, [
        { slug: '/', title: 'Home', artifactId: stream.artifactId, position: 0 },
      ]);
    }
  }, [
    stream.phase,
    stream.artifactId,
    stream.siteId,
    stream.cost,
    rounds,
    pages.length,
    selectedRecipe,
    appendRound,
    setActiveArtifactId,
    setSite,
    setPageArtifact,
  ]);

  const handleRefine = useCallback(
    (feedback: string) => {
      if (!selectedRecipe) return;
      // Iterate the page the operator is currently viewing: parent off the
      // active page's current round, not the globally last round. Now that
      // subpages are rounds too, `rounds[last]` could belong to a different
      // page (e.g. the most recently added one), which would refine the wrong
      // artifact and advance the wrong page pointer.
      const latest =
        rounds.find((r) => r.artifactId === activeArtifactId) ?? rounds[rounds.length - 1];
      if (!latest) return;
      if (latest.iterationRound >= MAX_ROUNDS) return;

      // New attempt: let its own outcome (including an error) drive the canvas.
      setStaleErrorDismissed(false);

      // Parent metadata is captured here at submit time and threaded to the
      // done-effect via the ref. Each iteration overwrites the ref; the
      // done-effect clears it once the round is appended.
      iterationContextRef.current = {
        parentArtifactId: latest.artifactId,
        parentRound: latest.iterationRound,
        targetSlug: activeSlug,
      };
      setIterateOverride({
        runKey: `iterate:${latest.artifactId}:${Date.now()}`,
        request: {
          kind: 'iterate',
          recipe: selectedRecipe,
          previousArtifactId: latest.artifactId,
          feedback,
          // Pass site context so the route advances site_pages.artifact_id
          // server-side alongside the client-side setPageArtifact call.
          // undefined values are dropped by JSON.stringify; Zod schema accepts both as optional.
          siteId: siteId ?? undefined,
          slug: activeSlug || undefined,
        },
      });
    },
    [selectedRecipe, rounds, siteId, activeSlug, activeArtifactId],
  );

  const handleSwitch = useCallback(
    (slug: string) => {
      const page = pages.find((p) => p.slug === slug);
      if (!page) return;
      setActiveSlug(slug);
      setActiveArtifactId(page.artifactId);
      // Viewing a chosen page supersedes any stale main-stream error.
      setStaleErrorDismissed(true);
    },
    [pages, setActiveSlug, setActiveArtifactId],
  );

  const latestRound = rounds[rounds.length - 1];
  const currentRoundIndex = latestRound?.iterationRound ?? 0;
  const isStreaming = stream.phase === 'streaming' || stream.phase === 'images';
  const rateLimited = stream.phase === 'error' && !!stream.error?.startsWith('429');

  // Show a generating-state pane during streaming + image compositing rather
  // than live srcDoc updates. Each srcDoc swap tears down the iframe and
  // re-parses the document, which re-fetches every external resource
  // referenced inside the artifact (fonts, images) — at ~5fps over a 30s
  // stream the user sees thousands of font requests and severe flicker.
  // The finished preview lands on `done` via the stable /preview/<id> route.
  const previewArtifactId = activeArtifactId ?? latestRound?.artifactId ?? null;
  const showGeneratingPane = isStreaming;
  const showStoredPreview =
    !showGeneratingPane && !!previewArtifactId && (stream.phase !== 'error' || staleErrorDismissed);

  // Nav injection in the wizard preview is handled by PagePreviewFrame:
  // it fetches raw HTML from /api/artifact/[id]/html, injects the current
  // site nav client-side via srcDoc, and re-injects on store changes without
  // refetching — closing the M6 wizard-preview nav injection gap.

  const showError = stream.phase === 'error' && !rateLimited && !showStoredPreview;

  // Side-by-side only fires when comparing AND the comparison target differs
  // from the active artifact (otherwise we'd render the same iframe twice).
  // Streaming also suppresses comparison because the preview pane is locked
  // to the generating state during that window.
  const showSideBySide =
    !!compareWithArtifactId &&
    !!previewArtifactId &&
    compareWithArtifactId !== previewArtifactId &&
    showStoredPreview;

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

      <div
        className={[
          'mt-[var(--space-6)] gap-[var(--space-6)]',
          hasExistingRound ? 'grid grid-cols-1 lg:grid-cols-[320px_1fr]' : 'block',
        ].join(' ')}
      >
        {hasExistingRound ? <IterationHistory shares={shares} /> : null}

        <div className="min-w-0 flex flex-col gap-[var(--space-6)]">
          {/* Page switcher — hidden when pages array is empty (pre-generation). */}
          <PageSwitcher
            pages={pages}
            activeSlug={activeSlug}
            onSwitch={handleSwitch}
            onAddPage={() => setAddPageOpen(true)}
            disabled={isStreaming}
          />

          {showGeneratingPane ? (
            <GeneratingPane
              phase={stream.phase}
              imageCount={stream.imageCount}
              isIteration={isIteration}
            />
          ) : null}

          {showStoredPreview && showSideBySide && compareWithArtifactId && previewArtifactId ? (
            <SideBySidePreview
              activeArtifactId={previewArtifactId}
              compareArtifactId={compareWithArtifactId}
            />
          ) : null}

          {showStoredPreview && !showSideBySide && previewArtifactId ? (
            <PagePreviewFrame artifactId={previewArtifactId} title="Generated artifact preview" />
          ) : null}

          {showError ? <ErrorPane message={stream.error ?? 'unknown error'} /> : null}

          {!showGeneratingPane && !showStoredPreview && !showError ? <PreparingPane /> : null}

          {stream.phase === 'done' && stream.usage ? (
            <p className="font-[family-name:var(--font-mono)] text-[var(--text-base)] text-[var(--color-ink-muted)]">
              {stream.usage.inputTokens} in · {stream.usage.cacheReadTokens} cache ·{' '}
              {stream.usage.outputTokens} out · ${(stream.cost ?? 0).toFixed(3)}
              {stream.imagesInjected ? ` · ${stream.imagesInjected} images` : ''}
            </p>
          ) : null}

          {hasExistingRound && !isStreaming && previewArtifactId ? (
            <FinishActions
              artifactId={previewArtifactId}
              siteId={siteId}
              onShareCreated={refreshShares}
            />
          ) : null}

          {hasExistingRound ? (
            <RefinePanel
              roundCount={currentRoundIndex}
              maxRounds={MAX_ROUNDS}
              disabled={isStreaming}
              rateLimited={rateLimited}
              onSubmit={handleRefine}
            />
          ) : null}
        </div>
      </div>

      {/* AddPageModal — rendered at StepGenerate level so its unmount on close
          triggers the billable-stream abort in useGenerationStream's cleanup. */}
      <AddPageModal
        open={addPageOpen}
        onClose={() => setAddPageOpen(false)}
        siteId={siteId ?? ''}
        existingSlugs={pages.map((p) => p.slug)}
        nextPosition={pages.length === 0 ? 0 : Math.max(...pages.map((p) => p.position)) + 1}
        onSuccess={(page, meta) => {
          addPage(page);
          // Record the subpage as the "Original" (root) round of its own
          // per-page iteration chain, carrying its real generation cost — so
          // the History panel shows it and per-page refine can parent off it,
          // exactly like the landing page's round.
          appendRound({
            artifactId: page.artifactId,
            parentArtifactId: null,
            iterationRound: 0,
            recipeSummary: page.title,
            cost: meta.cost,
            generatedAt: meta.generatedAt,
          });
          setActiveSlug(page.slug);
          setActiveArtifactId(page.artifactId);
          // A freshly added page must show even if a prior generate/refine
          // left the main stream in an error phase.
          setStaleErrorDismissed(true);
        }}
      />
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

interface GeneratingPaneProps {
  phase: 'streaming' | 'images' | 'idle' | 'done' | 'error';
  imageCount: number;
  isIteration: boolean;
}

function GeneratingPane({ phase, imageCount, isIteration }: GeneratingPaneProps) {
  const heading = isIteration ? 'Iterating' : 'Generating';
  const phaseLine =
    phase === 'images'
      ? `Compositing ${imageCount} image${imageCount === 1 ? '' : 's'}`
      : 'Streaming HTML from Claude Opus';

  // Two-phase progress indicator: HTML stream → image composition.
  // The image phase only kicks in after the HTML is done streaming, so the
  // first dot lights up on streaming, second dot on images. Provides clearer
  // signal than a single indeterminate spinner without burning CPU on
  // animations that flicker the page during a long render.
  const dots: Array<{ key: string; label: string; active: boolean; done: boolean }> = [
    {
      key: 'html',
      label: 'HTML',
      active: phase === 'streaming',
      done: phase === 'images',
    },
    {
      key: 'images',
      label: 'Images',
      active: phase === 'images',
      done: false,
    },
  ];

  return (
    <div className="flex h-[720px] w-full flex-col items-center justify-center gap-[var(--space-6)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-[var(--space-8)]">
      <div className="flex flex-col items-center gap-[var(--space-3)]">
        <p className="font-[family-name:var(--font-display)] text-[var(--text-2xl)] tracking-tight text-[var(--color-ink)]">
          {heading}…
        </p>
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">{phaseLine}</p>
      </div>

      <ol className="flex items-center gap-[var(--space-6)]" aria-hidden>
        {dots.map((dot) => (
          <li key={dot.key} className="flex items-center gap-[var(--space-2)]">
            <span
              className={[
                'block h-[8px] w-[8px] rounded-full transition-colors duration-[var(--duration-fast)]',
                dot.done
                  ? 'bg-[var(--color-accent)]'
                  : dot.active
                    ? 'animate-pulse bg-[var(--color-accent)]'
                    : 'bg-[var(--color-border)]',
              ].join(' ')}
            />
            <span
              className={[
                'font-[family-name:var(--font-mono)] text-[var(--text-base)] uppercase tracking-[0.12em]',
                dot.active || dot.done
                  ? 'text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-muted)]',
              ].join(' ')}
            >
              {dot.label}
            </span>
          </li>
        ))}
      </ol>

      <p className="max-w-[36ch] text-center text-[var(--text-base)] text-[var(--color-ink-muted)]">
        Hang tight — Opus typically finishes the HTML in 30–60 seconds, then we composite images.
      </p>
    </div>
  );
}

interface FinishActionsProps {
  artifactId: string;
  siteId: string | null;
  onShareCreated?: () => void;
}

function FinishActions({ artifactId, siteId, onShareCreated }: FinishActionsProps) {
  const brief = useWizardStore((s) => s.brief);
  const rounds = useWizardStore((s) => s.rounds);
  const [shareOpen, setShareOpen] = useState(false);

  const activeRound = rounds.find((r) => r.artifactId === artifactId);
  const projectName = brief?.projectName?.trim() || 'Untitled';
  const defaultName = `${projectName} — round ${activeRound?.iterationRound ?? 0}`;

  return (
    <>
      <section
        aria-label="Finish actions"
        className="flex flex-col gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-[var(--space-5)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-[var(--space-1)]">
          <p className="font-[family-name:var(--font-display)] text-[var(--text-lg)] tracking-tight text-[var(--color-ink)]">
            Looks good — keep this one?
          </p>
          <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
            Create a share link to save this version and send it to anyone. You can keep refining
            below if you want.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-[var(--space-3)] sm:items-end">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={!siteId}
            className="inline-flex items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-[var(--space-5)] py-[var(--space-3)] text-[var(--text-base)] font-medium text-[var(--color-surface)] transition-transform duration-[var(--duration-fast)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create share link
          </button>

          {/* Design contract download — only rendered once a site exists.
              Uses the established <details>/<summary> disclosure pattern
              (server-renderable, no extra JS) consistent with share-footer.tsx.
              Points at the operator route: GET /api/site/<siteId>/contract
              Valid filenames are EXACTLY contract.md, tokens.json, tokens.css
              (verified against VALID_FILES in the route). */}
          {siteId ? (
            <details className="group">
              <summary className="inline-flex cursor-pointer select-none list-none items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-base)] text-[var(--color-ink-muted)] transition-[border-color,color,transform] duration-[var(--duration-fast)] hover:-translate-y-px hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]">
                Design contract ↓
              </summary>
              <div className="mt-[var(--space-2)] flex flex-col items-end gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-[var(--space-3)] py-[var(--space-2)]">
                <a
                  href={`/api/site/${siteId}/contract?file=contract.md`}
                  download="contract.md"
                  className="text-[var(--text-base)] text-[var(--color-ink-muted)] no-underline hover:text-[var(--color-ink)] hover:underline"
                >
                  Contract (Markdown)
                </a>
                <a
                  href={`/api/site/${siteId}/contract?file=tokens.json`}
                  download="tokens.json"
                  className="text-[var(--text-base)] text-[var(--color-ink-muted)] no-underline hover:text-[var(--color-ink)] hover:underline"
                >
                  Tokens (JSON)
                </a>
                <a
                  href={`/api/site/${siteId}/contract?file=tokens.css`}
                  download="tokens.css"
                  className="text-[var(--text-base)] text-[var(--color-ink-muted)] no-underline hover:text-[var(--color-ink)] hover:underline"
                >
                  Tokens (CSS)
                </a>
              </div>
            </details>
          ) : null}

          {/* Secondary action — "Open standalone" only. The destructive
              "Start a new project" was removed from here because it
              duplicated the top-nav <WizardStartOver/> (which now wears
              the destructive-red treatment) AND was visually identical
              to this non-destructive link, which let users wipe the whole
              session by misreading two buttons that looked the same. */}
          <a
            href={`/preview/${artifactId}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-base)] text-[var(--color-ink-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
          >
            Open standalone
            <span aria-hidden>↗</span>
          </a>
        </div>
      </section>

      <CreateShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        siteId={siteId}
        defaultName={defaultName}
        onSuccess={onShareCreated}
      />
    </>
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
