import type { ShareStore } from './share-store';
import { MemoryShareStore } from './share-store-memory';
import { SupabaseShareStore } from './share-store-supabase';

let cached: ShareStore | null = null;

/**
 * Returns the configured ShareStore implementation. Cached per process so the
 * same instance is reused across requests (important on Vercel where the
 * function module is cached across invocations within the same container).
 *
 * Backend is picked by `FB_ARCHIVE_BACKEND` env var (shared with the archive
 * factory — both stores live in the same Supabase project; selecting them
 * independently makes no sense):
 *   - `'supabase'` → `SupabaseShareStore` (production)
 *   - `'fs'` or unset → `MemoryShareStore` (local dev, tests, ephemeral fallback)
 *
 * Note: `MemoryShareStore` does NOT persist across server restarts in dev.
 * That's intentional — dev shares are session-scoped. Use FB_ARCHIVE_BACKEND=supabase
 * locally if you want shares to survive `pnpm dev` restarts.
 */
export function defaultShareStore(): ShareStore {
  if (cached) return cached;
  const backend = process.env.FB_ARCHIVE_BACKEND ?? 'fs';
  cached = backend === 'supabase' ? new SupabaseShareStore() : new MemoryShareStore();
  return cached;
}

/**
 * Test-only helper. Clears the cached store so tests can swap the backend
 * via env vars between cases. Production code never calls this.
 */
export function _resetShareStoreCacheForTests(): void {
  cached = null;
}
