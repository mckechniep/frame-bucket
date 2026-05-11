/**
 * Module-level deduped fetch helper for effects that fire on mount.
 *
 * Solves two problems at once:
 *
 * 1. React StrictMode in dev double-mounts every effect (setup → cleanup →
 *    setup). With the naive AbortController pattern, the first mount fires a
 *    request, the cleanup aborts it, and the second mount fires a fresh one
 *    — the Network panel shows two requests where there should be one.
 *
 * 2. Genuine user navigation should still cancel an in-flight request so we
 *    don't pay for tokens the user no longer wants (the M3 kill-switch
 *    requirement).
 *
 * Approach: ref-counted promises keyed by a stable string. Multiple acquires
 * with the same key share the same Promise and the same underlying fetch.
 * When listeners drop to zero, the abort is scheduled but deferred for a
 * grace period (default 200ms) — long enough that StrictMode's
 * mount-unmount-mount cycle doesn't kill the request, short enough that a
 * real user navigation cancels promptly.
 */

interface CacheEntry<T> {
  promise: Promise<T>;
  abort: AbortController;
  listeners: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const cache = new Map<string, CacheEntry<unknown>>();

const GRACE_MS = 200;

export interface DedupedHandle<T> {
  promise: Promise<T>;
  release: () => void;
}

export function dedupedRequest<T>(
  key: string,
  factory: (signal: AbortSignal) => Promise<T>,
): DedupedHandle<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    const abort = new AbortController();
    const promise = factory(abort.signal).finally(() => {
      // The promise has settled (resolved, rejected, or aborted). The cache
      // entry is no longer reusable — a fresh call should kick off a new
      // request, not return this settled promise.
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
    });
    entry = { promise, abort, listeners: 0, cleanupTimer: null };
    cache.set(key, entry as CacheEntry<unknown>);
  }

  const current = entry;
  current.listeners += 1;
  if (current.cleanupTimer) {
    clearTimeout(current.cleanupTimer);
    current.cleanupTimer = null;
  }

  let released = false;
  return {
    promise: current.promise,
    release: () => {
      if (released) return;
      released = true;
      current.listeners -= 1;
      if (current.listeners > 0) return;
      current.cleanupTimer = setTimeout(() => {
        if (current.listeners === 0) {
          current.abort.abort();
          if (cache.get(key) === current) {
            cache.delete(key);
          }
        }
      }, GRACE_MS);
    },
  };
}

// Test-only: clear all cached entries. Used in unit tests; never call in
// production code paths.
export function __resetDedupedRequestCache(): void {
  for (const entry of cache.values()) {
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    entry.abort.abort();
  }
  cache.clear();
}
