'use client';
import { useState } from 'react';

type Diff = {
  added: Array<{ name: string; bucket: string }>;
  removed: Array<{ name: string; bucket: string }>;
  modified: Array<{ entry: { name: string; bucket: string }; changedFields: string[] }>;
  renamed: Array<{ from: string; to: string }>;
};

export function AdminSyncPanel({ adminToken }: { adminToken: string }) {
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);

  async function preview() {
    setLoading(true);
    setError(null);
    setCommitted(false);
    try {
      const res = await fetch('/api/admin/sync', {
        headers: { 'x-admin-secret': adminToken },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'sync failed');
      setDiff(body.diff as Diff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { 'x-admin-secret': adminToken },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'commit failed');
      setCommitted(true);
      setDiff(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={preview}
        disabled={loading}
        className="px-4 py-2 border border-current rounded-[var(--radius-md)] disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'Preview sync'}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {committed && <p className="text-green-700 text-sm">Synced. Cache updated.</p>}
      {diff && (
        <div className="space-y-3">
          <p className="text-[var(--color-ink-muted)]">
            Added: {diff.added.length} · Modified: {diff.modified.length} · Removed:{' '}
            {diff.removed.length} · Renamed: {diff.renamed.length}
          </p>
          <button
            onClick={confirm}
            disabled={loading}
            className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded-[var(--radius-md)] disabled:opacity-50"
          >
            Confirm &amp; write
          </button>
        </div>
      )}
    </div>
  );
}
