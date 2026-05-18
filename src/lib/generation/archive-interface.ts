import type { ArchiveRecord } from './archive';

export type { ArchiveRecord };

/**
 * Pluggable archive backend contract. Two implementations:
 *   - FilesystemArchiveStore (./archive.ts) for local dev — writes to tmp/generations/
 *   - SupabaseArchiveStore (./archive-supabase.ts) for prod — writes to the artifacts table
 *
 * Selected at runtime by the factory in ./archive-factory.ts based on
 * the FB_ARCHIVE_BACKEND env var.
 */
export interface ArchiveStore {
  save(
    record: Omit<ArchiveRecord, 'iterationRound'> & Partial<Pick<ArchiveRecord, 'iterationRound'>>,
  ): Promise<string>;

  /** Returns true if an artifact with this id exists in the backend. */
  exists(id: string): Promise<boolean>;

  /**
   * Returns the subset of ids that exist. Default impl can be `Promise.all` over
   * `exists` (cheap for fs); Supabase impl should override with a single `.in()`
   * query (one round-trip instead of N).
   */
  existsMany(ids: string[]): Promise<Set<string>>;

  read(id: string): Promise<ArchiveRecord | null>;

  getChildren(parentId: string): Promise<Array<ArchiveRecord & { id: string }>>;
}
