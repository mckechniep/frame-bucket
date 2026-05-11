'use client';
import { useEffect, useRef, useState } from 'react';
import type { Recipe } from '@/lib/types';

interface StreamStats {
  cost: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  imagesInjected?: number;
}

type Phase = 'streaming' | 'images' | 'done';

export interface Round {
  recipe: Recipe;
  html: string;
  artifactId: string;
  iterationRound: number;
  parentArtifactId?: string;
  feedback?: string;
}

export type StreamRequest =
  | { kind: 'generate'; recipe: Recipe }
  | {
      kind: 'iterate';
      recipe: Recipe;
      previousHtml: string;
      previousArtifactId: string;
      feedback: string;
      iterationRound: number;
    };

interface StreamViewProps {
  request: StreamRequest;
  onDone: (round: Round) => void;
  onRateLimited?: () => void;
  onError?: (error: string) => void;
}

// StreamView must be mounted with key={runId} by the parent.
// Each new stream gets a fresh component instance — state is never reset
// mid-render, and the effect closure captures the correct request at mount.
export function StreamView({ request, onDone, onRateLimited, onError }: StreamViewProps) {
  const [html, setHtml] = useState('');
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('streaming');
  const [imageCount, setImageCount] = useState(0);

  // [Kill-switch point 3] AbortController stored in a ref.
  // Created once per component instance (each mount = fresh run).
  // On unmount the cleanup function calls abort() — any in-flight fetch
  // (and the server-side Anthropic stream) is cancelled immediately,
  // preventing runaway token consumption after browser disconnect.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    let cancelled = false;

    const endpoint = request.kind === 'generate' ? '/api/generate' : '/api/iterate';

    let body: Record<string, unknown>;
    if (request.kind === 'generate') {
      body = { recipe: request.recipe };
    } else {
      body = {
        recipe: request.recipe,
        previousHtml: request.previousHtml,
        previousArtifactId: request.previousArtifactId,
        feedback: request.feedback,
      };
    }

    async function run() {
      // [Kill-switch point 4] Pass abort.signal so if the browser disconnects
      // or cleanup fires, the in-flight fetch (and the server-side Anthropic
      // stream) is cancelled immediately — no more runaway token spend.
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      // Handle 429 rate limit specifically (iteration round cap).
      if (res.status === 429) {
        onRateLimited?.();
        return;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        const msg = `${res.status} — ${errText}`;
        setError(msg);
        onError?.(msg);
        onDone({ recipe: request.recipe, html: '', artifactId: '', iterationRound: 0 });
        return;
      }

      if (!res.body) {
        setError('No response body');
        onDone({ recipe: request.recipe, html: '', artifactId: '', iterationRound: 0 });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalHtml = '';

      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const lines = raw.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event:'));
          const dataLine = lines.find((l) => l.startsWith('data:'));
          if (!eventLine || !dataLine) continue;
          const ev = eventLine.slice(6).trim();
          const data = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
          if (ev === 'delta') {
            finalHtml += data.text as string;
            setHtml((prev) => prev + (data.text as string));
          } else if (ev === 'images_started') {
            setPhase('images');
            setImageCount(data.count as number);
          } else if (ev === 'images_done') {
            setImageCount(data.count as number);
          } else if (ev === 'done') {
            const cost = data.cost as number;
            const usage = data.usage as {
              inputTokens: number;
              outputTokens: number;
              cacheReadTokens: number;
            };
            setStats({ cost, usage, imagesInjected: data.imagesInjected as number | undefined });
            // Final HTML has images injected — replace the streamed accumulation.
            if (typeof data.html === 'string') {
              finalHtml = data.html;
              setHtml(data.html);
            }
            setPhase('done');

            const artifactId = (data.artifactId as string) ?? '';
            const completedRound: Round = {
              recipe: request.recipe,
              html: finalHtml,
              artifactId,
              iterationRound: request.kind === 'generate' ? 0 : request.iterationRound,
              parentArtifactId: request.kind === 'iterate' ? request.previousArtifactId : undefined,
              feedback: request.kind === 'iterate' ? request.feedback : undefined,
            };
            onDone(completedRound);
          } else if (ev === 'error') {
            const msg = (data.error as string) ?? 'stream error';
            setError(msg);
            onError?.(msg);
          }
        }
      }
    }

    run().catch((err: unknown) => {
      // [Kill-switch point 5] AbortError on intentional cancel is expected —
      // don't surface as an error to the user.
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'unknown error';
      setError(msg);
      onError?.(msg);
    });

    // [Kill-switch point 3 & 5] Cleanup: abort on unmount.
    // Because StreamView is always mounted with a unique key, unmount happens
    // exactly when the parent wants to stop: on fresh generation start, on
    // page nav, or when the component tree is torn down. This ensures the
    // server-side Anthropic stream is always cancelled on disconnect.
    return () => {
      cancelled = true;
      abort.abort();
    };
    // Empty deps: effect runs once per mount. Parent uses key={runId} to
    // remount for each new stream, so "once per mount" == "once per request".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600">{error}</p>}
      {phase === 'images' && (
        <p className="text-sm opacity-70">
          Generating {imageCount} image{imageCount === 1 ? '' : 's'} via OpenRouter…
        </p>
      )}
      {stats && (
        <p className="text-sm opacity-70">
          Tokens in: {stats.usage.inputTokens} · cacheRead: {stats.usage.cacheReadTokens} · out:{' '}
          {stats.usage.outputTokens} · cost ${stats.cost.toFixed(3)}
          {stats.imagesInjected ? ` · images: ${stats.imagesInjected}` : ''}
        </p>
      )}
      {html && (
        <>
          <h3 className="text-sm uppercase tracking-wide opacity-70">Preview</h3>
          <iframe
            sandbox=""
            srcDoc={html}
            className="w-full h-[600px] border"
            title="Generated preview"
          />
          <details>
            <summary className="cursor-pointer text-sm opacity-70">View code</summary>
            <pre className="text-xs overflow-auto max-h-[400px] bg-[var(--color-surface-alt)] p-3 rounded">
              {html}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
