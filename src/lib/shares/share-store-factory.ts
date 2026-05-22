import type { ShareStore } from './share-store';
import { MemoryShareStore } from './share-store-memory';
import { SupabaseShareStore } from './share-store-supabase';

// Cache on globalThis instead of module scope. In Next 16 dev (Turbopack),
// the server-component module graph and the route-handler module graph
// are bundled separately, so a `let cached` at module scope is NOT a
// process singleton — each bundle gets its own copy. That meant POSTing
// /api/share (route handler graph) wrote to instance A and reading from
// the /shares RSC (server-component graph) read from a fresh instance B,
// which appeared empty. Hoisting onto globalThis closes that gap and also
// survives HMR module reloads. Production (single bundle, no HMR) behaves
// identically. This is the same pattern Prisma / Drizzle / Auth.js recommend
// for dev-safe singletons in Next.js.
const SHARE_STORE_GLOBAL_KEY = Symbol.for('framebucket.shareStoreSingleton');
type ShareStoreGlobal = { [SHARE_STORE_GLOBAL_KEY]?: ShareStore };

/**
 * Returns the configured ShareStore implementation. Cached on globalThis so
 * one instance is reused across requests, bundles, and HMR cycles within a
 * single Node process.
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
  const g = globalThis as ShareStoreGlobal;
  const existing = g[SHARE_STORE_GLOBAL_KEY];
  if (existing) return existing;
  const backend = process.env.FB_ARCHIVE_BACKEND ?? 'fs';
  const instance = backend === 'supabase' ? new SupabaseShareStore() : new MemoryShareStore();
  g[SHARE_STORE_GLOBAL_KEY] = instance;
  return instance;
}

/**
 * Test-only helper. Clears the cached store so tests can swap the backend
 * via env vars between cases. Production code never calls this.
 */
export function _resetShareStoreCacheForTests(): void {
  const g = globalThis as ShareStoreGlobal;
  delete g[SHARE_STORE_GLOBAL_KEY];
}
