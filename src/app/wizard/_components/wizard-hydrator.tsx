'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useWizardStore } from '@/lib/wizard/store';

/**
 * Runs once per wizard session — after Zustand persist finishes hydrating
 * from localStorage, posts every persisted round's artifactId to
 * /api/artifact/exists. The server returns the subset that still exists on
 * disk; the store drops any round whose archive is gone.
 *
 * Why: in dev, `tmp/generations/` gets wiped between runs but the user's
 * localStorage survives. Without this step the wizard would render iframes
 * pointing at deleted artifacts (broken-image preview pane, no error
 * message). The check fires once and is silent unless something was
 * dropped, in which case we surface a small notice for ~8s.
 */

function useStoreHydrated(): boolean {
  return useSyncExternalStore(
    (callback) => useWizardStore.persist.onFinishHydration(callback),
    () => useWizardStore.persist.hasHydrated(),
    () => false,
  );
}

export function WizardHydrator() {
  const hydrated = useStoreHydrated();
  const [droppedCount, setDroppedCount] = useState(0);
  // Guard against double-invocation under StrictMode dev double-mount. The
  // /api/artifact/exists call is cheap (a few fs.stat calls) so a double-fire
  // is harmless, but the notice would flash twice. Module-level flag would
  // survive across remounts; a ref is per-mount which is fine here because
  // StrictMode dev only doubles the initial mount, not subsequent ones.
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const initialIds = useWizardStore.getState().rounds.map((r) => r.artifactId);
    if (initialIds.length === 0) return;

    const abort = new AbortController();
    fetch('/api/artifact/exists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactIds: initialIds }),
      signal: abort.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ existing: string[] }>) : null))
      .then((body) => {
        if (!body) return;
        const dropped = useWizardStore.getState().hydrateAndValidate(body.existing);
        if (dropped > 0) {
          console.warn(
            `[wizard] dropped ${dropped} persisted round(s) whose archive directories are missing`,
          );
          setDroppedCount(dropped);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;

        console.warn('[wizard] hydrate-and-validate failed:', err);
      });

    return () => abort.abort();
  }, [hydrated]);

  useEffect(() => {
    if (droppedCount === 0) return;
    const timer = setTimeout(() => setDroppedCount(0), 8000);
    return () => clearTimeout(timer);
  }, [droppedCount]);

  if (droppedCount === 0) return null;

  return (
    <div
      role="status"
      className="fixed bottom-[var(--space-6)] left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-5)] py-[var(--space-3)] shadow-lg"
    >
      <p className="text-[var(--text-base)] text-[var(--color-ink)]">
        Cleaned up {droppedCount} saved round{droppedCount === 1 ? '' : 's'} whose archive is no
        longer on disk.
      </p>
    </div>
  );
}
