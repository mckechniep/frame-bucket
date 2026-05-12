'use client';

import { useEffect, useState } from 'react';

import type { Recipe } from '@/lib/types';
import { dedupedRequest } from '@/lib/wizard/deduped-request';

/**
 * Shared SSE consumer for the wizard's generate + iterate flows.
 *
 * Why this exists:
 *  - Both the initial generation step and the refine panel stream HTML deltas
 *    from the server via the same SSE event protocol.
 *  - Both share the kill-switch requirement: an aborted request must not
 *    consume Opus tokens after the browser disconnects (M3 lesson).
 *  - Both must tolerate React StrictMode's mount-unmount-mount cycle without
 *    firing duplicate billable requests.
 *
 * The hook accepts a primitive `runKey` that determines when to fire. When
 * `runKey` is empty, the effect is idle. When it changes to a non-empty
 * value, the effect kicks off the fetch (deduped via the module-level
 * request cache). The `request` parameter is read at effect-run time — the
 * caller is responsible for keeping `runKey` in sync with semantic changes
 * to the request (typically by hashing the request into the key).
 *
 * Note: Per Rule 1 of the M4 plan, the iterate kind does NOT send
 * `previousHtml` — the server reads `parent.htmlSource` from the archive.
 * Sending HTML on the wire is a token-bomb risk.
 */

export type GenerationStreamRequest =
  | { kind: 'generate'; recipe: Recipe }
  | { kind: 'iterate'; recipe: Recipe; previousArtifactId: string; feedback: string };

export type StreamPhase = 'idle' | 'streaming' | 'images' | 'done' | 'error';

export interface GenerationStreamUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface GenerationStreamResult {
  phase: StreamPhase;
  html: string;
  imageCount: number;
  artifactId: string | null;
  cost: number | null;
  usage: GenerationStreamUsage | null;
  imagesInjected: number | null;
  error: string | null;
}

const INITIAL_RESULT: GenerationStreamResult = {
  phase: 'idle',
  html: '',
  imageCount: 0,
  artifactId: null,
  cost: null,
  usage: null,
  imagesInjected: null,
  error: null,
};

interface SSEDataDone {
  artifactId?: string;
  cost?: number;
  usage?: GenerationStreamUsage;
  imagesInjected?: number;
  html?: string;
}

export function useGenerationStream(
  request: GenerationStreamRequest | null,
  runKey: string,
): GenerationStreamResult {
  const [result, setResult] = useState<GenerationStreamResult>(INITIAL_RESULT);

  useEffect(() => {
    if (!runKey || !request) return;

    let cancelled = false;

    const endpoint = request.kind === 'generate' ? '/api/generate' : '/api/iterate';
    const body =
      request.kind === 'generate'
        ? { recipe: request.recipe }
        : {
            // Rule 1: no `previousHtml`. The route reads parent.htmlSource
            // server-side. Keeps the wire body small and impossible to
            // poison with multi-MB post-injection HTML.
            recipe: request.recipe,
            previousArtifactId: request.previousArtifactId,
            feedback: request.feedback,
          };

    const { promise, release } = dedupedRequest(`${request.kind}:${runKey}`, async (signal) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status} — ${errText}`);
      }
      if (!res.body) throw new Error('No response body');
      return res.body.getReader();
    });

    promise
      .then(async (reader) => {
        if (cancelled) return;
        const decoder = new TextDecoder();
        let buffer = '';
        let accHtml = '';
        let phase: StreamPhase = 'streaming';
        let imageCount = 0;

        if (!cancelled) {
          setResult({ ...INITIAL_RESULT, phase: 'streaming' });
        }

        const flushPartial = () => {
          if (cancelled) return;
          setResult((prev) => ({ ...prev, phase, html: accHtml, imageCount }));
        };

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
              accHtml += (data.text as string) ?? '';
              flushPartial();
            } else if (ev === 'images_started') {
              phase = 'images';
              imageCount = (data.count as number) ?? 0;
              flushPartial();
            } else if (ev === 'images_done') {
              imageCount = (data.count as number) ?? imageCount;
              flushPartial();
            } else if (ev === 'done') {
              const d = data as SSEDataDone;
              if (typeof d.html === 'string') accHtml = d.html;
              if (cancelled) return;
              setResult({
                phase: 'done',
                html: accHtml,
                imageCount,
                artifactId: d.artifactId ?? null,
                cost: d.cost ?? null,
                usage: d.usage ?? null,
                imagesInjected: d.imagesInjected ?? null,
                error: null,
              });
            } else if (ev === 'error') {
              const msg = (data.error as string) ?? 'stream error';
              if (cancelled) return;
              setResult((prev) => ({ ...prev, phase: 'error', error: msg }));
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'stream failed';
        setResult((prev) => ({ ...prev, phase: 'error', error: msg }));
      });

    return () => {
      cancelled = true;
      release();
    };
    // `request` is captured at effect-run time and intentionally not in deps —
    // the caller controls re-fires via `runKey`. See hook docstring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  return result;
}
