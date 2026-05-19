import path from 'node:path';
import type { ArchiveStore } from './archive-interface';
import { FilesystemArchiveStore } from './archive';
import { SupabaseArchiveStore } from './archive-supabase';

let cached: ArchiveStore | null = null;

/**
 * Returns the configured ArchiveStore implementation. Cached per process so
 * the same instance is reused across requests (important on Vercel where
 * the function module is cached across invocations within the same container).
 *
 * Backend is picked by `FB_ARCHIVE_BACKEND` env var:
 *   - `'supabase'` → `SupabaseArchiveStore` (production)
 *   - `'fs'` or unset → `FilesystemArchiveStore` (local dev — reads/writes `tmp/generations/`)
 */
export function defaultArchiveStore(): ArchiveStore {
  if (cached) return cached;
  const backend = process.env.FB_ARCHIVE_BACKEND ?? 'fs';
  switch (backend) {
    case 'supabase':
      cached = new SupabaseArchiveStore();
      break;
    case 'fs':
    default:
      cached = new FilesystemArchiveStore(path.join(process.cwd(), 'tmp', 'generations'));
      break;
  }
  return cached;
}

/**
 * Test-only helper. Clears the cached store so tests can swap the backend
 * via env vars between cases. Production code never calls this.
 */
export function _resetArchiveStoreCacheForTests(): void {
  cached = null;
}
