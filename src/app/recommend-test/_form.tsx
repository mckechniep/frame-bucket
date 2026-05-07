'use client';
import { useCallback, useState } from 'react';
import type { Taxonomy, Vibe } from '@/lib/types';
import type { RecommendationResult, RankedPick } from '@/lib/types/recommendation';

interface RecommendResponse {
  recommendation: RecommendationResult;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  cost: number;
}

// taxonomy is accepted for API symmetry with the generate-test form but is
// not used for field rendering — the recommend form only needs Brief fields.
export function RecommendTestForm({ taxonomy: _taxonomy }: { taxonomy: Taxonomy }) {
  const [projectName, setProjectName] = useState('Maple St Bakery');
  const [industry, setIndustry] = useState('Food & Beverage');
  const [vibe, setVibe] = useState<Vibe>('mom-and-pop');
  const [customVibe, setCustomVibe] = useState('');
  const [description, setDescription] = useState(
    'Family-run bakery; avoid generic cafe tropes; warm and considered.',
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable callback — prevents re-firing on form re-renders.
  // Even though recommendation is cheap (~$0.005), we still wire AbortController
  // to match the project pattern and avoid orphaned in-flight requests.
  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    const abort = new AbortController();
    const brief = {
      projectName,
      industry,
      vibe,
      description,
      ...(vibe === 'custom' && customVibe ? { customVibe } : {}),
    };

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brief),
        signal: abort.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        setError(`${res.status} — ${body.error ?? res.statusText}`);
        return;
      }
      const data = (await res.json()) as RecommendResponse;
      setResult(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectName, industry, vibe, customVibe, description]);

  return (
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
        {vibe === 'custom' && (
          <Field label="Custom vibe description">
            <input
              value={customVibe}
              onChange={(e) => setCustomVibe(e.target.value)}
              placeholder="Describe the vibe..."
              className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
            />
          </Field>
        )}
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
          />
        </Field>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded-[var(--radius-md)] disabled:opacity-50"
        >
          {loading ? 'Recommending…' : 'Recommend'}
        </button>
      </div>
      <div>
        {result ? (
          <ResultView response={result} />
        ) : (
          <p className="text-[var(--color-ink-muted)]">Fill the form and recommend.</p>
        )}
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

function ResultView({ response }: { response: RecommendResponse }) {
  const { recommendation, usage, cost } = response;
  const buckets: Array<{ label: string; picks: RankedPick[] }> = [
    { label: 'Aesthetics', picks: recommendation.aesthetics },
    { label: 'Layouts', picks: recommendation.layouts },
    { label: 'Interactions', picks: recommendation.interactions },
    { label: 'Systems', picks: recommendation.systems },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm opacity-70">
        Tokens in: {usage.inputTokens} · cacheRead: {usage.cacheReadTokens} · out:{' '}
        {usage.outputTokens} · cost ${cost.toFixed(4)}
      </p>
      {buckets.map(({ label, picks }) =>
        picks.length === 0 ? null : (
          <section key={label}>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-3 opacity-70">
              {label}
            </h2>
            <ul className="space-y-4">
              {picks.map((pick) => (
                <li key={pick.entryId} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{pick.entryName}</span>
                    <span className="text-sm opacity-60 tabular-nums">
                      {(pick.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {/* CSS-only confidence bar */}
                  <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--color-ink)]"
                      style={{ width: `${(pick.confidence * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <p className="text-sm opacity-70">{pick.reasoning}</p>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
