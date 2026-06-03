import path from 'node:path';
import type { ContractStore } from './contract-store';
import { FsContractStore } from './contract-store-fs';
import { SupabaseContractStore } from './contract-store-supabase';

// Cache on globalThis instead of module scope. In Next 16 dev (Turbopack),
// the server-component module graph and the route-handler module graph are
// bundled separately, so a `let cached` at module scope is NOT a process
// singleton — each bundle gets its own copy. Hoisting onto globalThis closes
// that gap and also survives HMR module reloads. Production (single bundle,
// no HMR) behaves identically. This is the same pattern used by the site-store
// and share-store factories.
const CONTRACT_STORE_GLOBAL_KEY = Symbol.for('framebucket.contractStoreSingleton');
type ContractStoreGlobal = { [CONTRACT_STORE_GLOBAL_KEY]?: ContractStore };

/**
 * Returns the configured ContractStore implementation. Cached on globalThis so
 * one instance is reused across requests, bundles, and HMR cycles within a
 * single Node process.
 *
 * Backend is picked by `FB_ARCHIVE_BACKEND` env var (shared with the archive,
 * site, and share-store factories — all stores target the same backend):
 *   - `'supabase'` → `SupabaseContractStore` (production)
 *   - `'fs'` or unset → `FsContractStore` (local dev — reads/writes `tmp/generations/`)
 */
export function defaultContractStore(): ContractStore {
  const g = globalThis as ContractStoreGlobal;
  const existing = g[CONTRACT_STORE_GLOBAL_KEY];
  if (existing) return existing;
  const backend = process.env.FB_ARCHIVE_BACKEND ?? 'fs';
  const instance: ContractStore =
    backend === 'supabase'
      ? new SupabaseContractStore()
      : new FsContractStore(path.join(process.cwd(), 'tmp', 'generations'));
  g[CONTRACT_STORE_GLOBAL_KEY] = instance;
  return instance;
}

/**
 * Test-only helper. Clears the cached store so tests can swap the backend
 * via env vars between cases. Production code never calls this.
 */
export function _resetContractStoreCacheForTests(): void {
  const g = globalThis as ContractStoreGlobal;
  delete g[CONTRACT_STORE_GLOBAL_KEY];
}
