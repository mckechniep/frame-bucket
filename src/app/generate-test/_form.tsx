'use client';
import { useCallback, useState } from 'react';
import type { Taxonomy, TaxonomyEntry, Recipe, Vibe } from '@/lib/types';
import { StreamView } from './_stream-view';
import type { Round, StreamRequest } from './_stream-view';
import { RefinePanel } from './_refine-panel';

const MAX_ROUNDS = 3;

export function GenerateTestForm({ taxonomy }: { taxonomy: Taxonomy }) {
  const [projectName, setProjectName] = useState('Maple St Bakery');
  const [industry, setIndustry] = useState('Food & Beverage');
  const [vibe, setVibe] = useState<Vibe>('mom-and-pop');
  const [description, setDescription] = useState(
    'Family-run bakery; avoid generic cafe tropes; warm and considered.',
  );
  const [aestheticId, setAestheticId] = useState(taxonomy.aesthetics[0]?.id ?? 'editorial');
  const [layoutId, setLayoutId] = useState(taxonomy.layouts[0]?.id ?? 'editorial-spread');
  const [formError, setFormError] = useState<string | null>(null);

  // Iteration state
  const [rounds, setRounds] = useState<Round[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [runId, setRunId] = useState(0);
  const [activeRequest, setActiveRequest] = useState<StreamRequest | null>(null);

  // Track whether we've ever started a stream (to know if StreamView should render)
  const hasStarted = activeRequest !== null;

  function find(id: string, arr: TaxonomyEntry[]): TaxonomyEntry | undefined {
    return arr.find((e) => e.id === id);
  }

  function handleGenerate() {
    setFormError(null);
    const aesthetic = find(aestheticId, taxonomy.aesthetics);
    const layout = find(layoutId, taxonomy.layouts);
    if (!aesthetic || !layout) {
      setFormError('Unknown aesthetic/layout id');
      return;
    }
    const recipe: Recipe = {
      brief: { projectName, industry, vibe, description },
      aesthetic,
      layout,
    };
    // Reset iteration state for a fresh generation
    setRounds([]);
    setRateLimited(false);
    setStreaming(true);
    setActiveRequest({ kind: 'generate', recipe });
    setRunId((id) => id + 1);
  }

  // Stable callback — onDone fires when a stream finishes. We append the
  // completed round to history and stop streaming.
  const handleStreamDone = useCallback((round: Round) => {
    setStreaming(false);
    // Only add to rounds if we got a real artifactId back
    if (round.artifactId) {
      setRounds((prev) => [...prev, round]);
    }
  }, []);

  const handleRateLimited = useCallback(() => {
    setStreaming(false);
    setRateLimited(true);
  }, []);

  const handleStreamError = useCallback((error: string) => {
    setStreaming(false);
    setFormError(error);
  }, []);

  // [Kill-switch point 1 & 2] Stable callback. deps include rounds because we
  // read the latest round at click time. The button is disabled while streaming,
  // enforced by the `disabled` prop passed to RefinePanel.
  const handleIterate = useCallback(
    (feedback: string) => {
      const latest = rounds[rounds.length - 1];
      const first = rounds[0];
      if (!latest || !first) return;
      if (latest.iterationRound >= MAX_ROUNDS) return;

      setFormError(null);
      setStreaming(true);

      const request: StreamRequest = {
        kind: 'iterate',
        recipe: first.recipe, // original recipe preserved across all iterations
        previousHtml: latest.html,
        previousArtifactId: latest.artifactId,
        feedback,
        iterationRound: latest.iterationRound + 1,
      };
      setActiveRequest(request);
      setRunId((id) => id + 1);
    },
    [rounds],
  );

  const latestRound = rounds[rounds.length - 1];
  const previousRounds = rounds.slice(0, -1);
  const iterationRound = latestRound?.iterationRound ?? 0;

  return (
    <div className="space-y-8">
      {/* Generation form — always visible so user can start a fresh generation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <Field label="Project name">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
            />
          </Field>
          <Field label="Industry">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
            />
          </Field>
          <Field label="Vibe">
            <select
              value={vibe}
              onChange={(e) => setVibe(e.target.value as Vibe)}
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
            >
              <option value="mom-and-pop">Mom &amp; Pop</option>
              <option value="scrappy-startup">Scrappy Startup</option>
              <option value="enterprise">Enterprise</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
            />
          </Field>
          <Field label="Aesthetic">
            <select
              value={aestheticId}
              onChange={(e) => setAestheticId(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
            >
              {taxonomy.aesthetics.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.hasOverride ? ' ●' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Layout">
            <select
              value={layoutId}
              onChange={(e) => setLayoutId(e.target.value)}
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
            >
              {taxonomy.layouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          {/* [Kill-switch point 2] Generate button disabled while any stream is in flight */}
          <button
            onClick={handleGenerate}
            disabled={streaming}
            className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded-[var(--radius-md)] disabled:opacity-50"
          >
            {streaming && activeRequest?.kind === 'generate' ? 'Generating…' : 'Generate'}
          </button>
        </div>

        <div className="space-y-6">
          {/* Active stream view — shown while streaming OR while the latest
              round has been established but we want to display StreamView output */}
          {/* key={runId} remounts StreamView for each new request — fresh state,
              effect fires once, and cleanup on unmount aborts any in-flight fetch. */}
          {hasStarted && activeRequest && (
            <StreamView
              key={runId}
              request={activeRequest}
              onDone={handleStreamDone}
              onRateLimited={handleRateLimited}
              onError={handleStreamError}
            />
          )}

          {/* No stream started yet */}
          {!hasStarted && (
            <p className="text-[var(--color-ink-muted)]">Fill the form and generate.</p>
          )}

          {/* Completed rounds: previous rounds as collapsibles, latest as active */}
          {!streaming && rounds.length > 0 && (
            <div className="space-y-4">
              {/* Previous rounds — collapsed by default */}
              {previousRounds.length > 0 && (
                <div className="space-y-2">
                  {previousRounds.map((round, idx) => (
                    <details key={round.artifactId || idx} className="border rounded">
                      <summary className="cursor-pointer px-3 py-2 text-sm opacity-70 select-none">
                        {round.iterationRound === 0
                          ? 'Round 0 — Original generation'
                          : `Round ${round.iterationRound} — ${round.feedback ? round.feedback.slice(0, 60) + (round.feedback.length > 60 ? '…' : '') : 'iteration'}`}
                      </summary>
                      <div className="p-3 space-y-2">
                        <iframe
                          sandbox=""
                          srcDoc={round.html}
                          className="w-full h-[300px] border"
                          title={`Round ${round.iterationRound} preview`}
                        />
                        <details>
                          <summary className="cursor-pointer text-xs opacity-60">View code</summary>
                          <pre className="text-xs overflow-auto max-h-[200px] bg-[var(--color-surface-alt)] p-2 rounded">
                            {round.html}
                          </pre>
                        </details>
                      </div>
                    </details>
                  ))}
                </div>
              )}

              {/* Latest round — active full preview */}
              {latestRound && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm uppercase tracking-wide opacity-70">
                      {latestRound.iterationRound === 0
                        ? 'Generated output'
                        : `Iteration ${latestRound.iterationRound}`}
                    </h3>
                    <span className="text-xs opacity-60">
                      Round {latestRound.iterationRound} of {MAX_ROUNDS} max
                    </span>
                  </div>
                  {latestRound.feedback && (
                    <p className="text-xs opacity-60 italic">
                      Feedback: &ldquo;{latestRound.feedback}&rdquo;
                    </p>
                  )}
                  <iframe
                    sandbox=""
                    srcDoc={latestRound.html}
                    className="w-full h-[600px] border"
                    title={`Round ${latestRound.iterationRound} preview`}
                  />
                  <details>
                    <summary className="cursor-pointer text-sm opacity-70">View code</summary>
                    <pre className="text-xs overflow-auto max-h-[400px] bg-[var(--color-surface-alt)] p-3 rounded">
                      {latestRound.html}
                    </pre>
                  </details>
                </div>
              )}

              {/* Refine panel — appears after any completed round */}
              <RefinePanel
                roundCount={iterationRound}
                maxRounds={MAX_ROUNDS}
                disabled={streaming}
                onSubmit={handleIterate}
                rateLimited={rateLimited}
              />
            </div>
          )}

          {/* Show refine panel rate-limited state even while streaming is false
              and rounds is empty (edge case: rate limited on first attempt) */}
          {!streaming && rounds.length === 0 && rateLimited && (
            <RefinePanel
              roundCount={0}
              maxRounds={MAX_ROUNDS}
              disabled={false}
              onSubmit={handleIterate}
              rateLimited={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm mb-1">{label}</div>
      {children}
    </label>
  );
}
