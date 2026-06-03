import type { SiteStore } from './site-store';
import { FsSiteStore } from './site-store-fs';
import { SupabaseSiteStore } from './site-store-supabase';

// Cache on globalThis instead of module scope. In Next 16 dev (Turbopack),
// the server-component module graph and the route-handler module graph
// are bundled separately, so a `let cached` at module scope is NOT a
// process singleton — each bundle gets its own copy. Hoisting onto globalThis
// closes that gap and also survives HMR module reloads. Production (single
// bundle, no HMR) behaves identically. This is the same pattern Prisma /
// Drizzle / Auth.js recommend for dev-safe singletons in Next.js.
const SITE_STORE_GLOBAL_KEY = Symbol.for('framebucket.siteStoreSingleton');
type SiteStoreGlobal = { [SITE_STORE_GLOBAL_KEY]?: SiteStore };

/**
 * Returns the configured SiteStore implementation. Cached on globalThis so
 * one instance is reused across requests, bundles, and HMR cycles within a
 * single Node process.
 *
 * Backend is picked by `FB_ARCHIVE_BACKEND` env var (shared with the archive
 * and share-store factories — all stores live in the same Supabase project;
 * selecting them independently makes no sense):
 *   - `'supabase'` → `SupabaseSiteStore` (production)
 *   - `'fs'` or unset → `FsSiteStore` (local dev, persistent across restarts)
 */
export function defaultSiteStore(): SiteStore {
  const g = globalThis as SiteStoreGlobal;
  const existing = g[SITE_STORE_GLOBAL_KEY];
  if (existing) return existing;
  const backend = process.env.FB_ARCHIVE_BACKEND ?? 'fs';
  const instance = backend === 'supabase' ? new SupabaseSiteStore() : new FsSiteStore();
  g[SITE_STORE_GLOBAL_KEY] = instance;
  return instance;
}

/**
 * Test-only helper. Clears the cached store so tests can swap the backend
 * via env vars between cases. Production code never calls this.
 */
export function _resetSiteStoreCacheForTests(): void {
  const g = globalThis as SiteStoreGlobal;
  delete g[SITE_STORE_GLOBAL_KEY];
}
