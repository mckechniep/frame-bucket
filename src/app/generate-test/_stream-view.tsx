'use client';
import { useEffect, useState } from 'react';
import type { Recipe } from '@/lib/types';

interface StreamStats {
  cost: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export function StreamView({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const [html, setHtml] = useState('');
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setHtml('');
      setError(null);
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }),
      });
      if (!res.body) {
        setError('No response body');
        onDone();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
          const data = JSON.parse(dataLine.slice(5).trim());
          if (ev === 'delta') setHtml((prev) => prev + data.text);
          else if (ev === 'done') setStats({ cost: data.cost, usage: data.usage });
          else if (ev === 'error') setError(data.message);
        }
      }
      onDone();
    }
    run().catch((err) => {
      setError(err instanceof Error ? err.message : 'unknown error');
      onDone();
    });
    return () => {
      cancelled = true;
    };
  }, [recipe, onDone]);

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600">{error}</p>}
      {stats && (
        <p className="text-sm opacity-70">
          Tokens in: {stats.usage.inputTokens} · cacheRead: {stats.usage.cacheReadTokens} · out:{' '}
          {stats.usage.outputTokens} · cost ${stats.cost.toFixed(3)}
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
