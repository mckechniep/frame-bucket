/**
 * A snapshot of one page within a site at the moment the share was created.
 * The snapshot pins the page state so recipients see exactly what was shared —
 * later edits to the site require a new share.
 */
export interface SharePageSnapshot {
  slug: string;
  title: string;
  artifactId: string;
  position: number;
}

/**
 * Domain representation of a share. Mirrors the `shares` table from M6
 * migration but is the canonical shape every store implementation returns.
 *
 * ISO 8601 strings (not Date objects) for timestamps — serializes cleanly
 * across the API boundary and Postgres returns them as strings by default.
 */
export interface ShareRecord {
  token: string;
  /** The site this share points at. */
  siteId: string;
  /** Snapshot of the site's pages at the time the share was created. */
  pages: SharePageSnapshot[];
  name: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  createdAt: string;
}

/**
 * Input for creating a new share.
 *
 * Pins a snapshot of the site's current page manifest so recipients see
 * exactly what was shared — later edits to the site require a new share.
 */
export type CreateShareInput = { siteId: string; name: string; pages: SharePageSnapshot[] };

/**
 * Contract for storing and querying share metadata. Two implementations:
 *  - MemoryShareStore (in-process, tests + dev fallback)
 *  - SupabaseShareStore (production, backed by `shares` + `share_view_buckets` tables)
 *
 * Selected at runtime by the factory in ./share-store-factory.ts (Task 10).
 */
export interface ShareStore {
  /**
   * Creates a new share with a fresh unguessable token.
   *
   * Accepts `{ siteId, name, pages }` — see {@link CreateShareInput} for details.
   * The pages array must be non-empty; throws otherwise.
   */
  create(input: CreateShareInput): Promise<ShareRecord>;

  /** Returns the share with the given token, or null if not found. */
  findByToken(token: string): Promise<ShareRecord | null>;

  /** All shares, ordered newest first. No pagination (M5 expects < few hundred). */
  list(): Promise<ShareRecord[]>;

  /** Updates the share's name. Returns the updated record, or null if not found. */
  rename(token: string, name: string): Promise<ShareRecord | null>;

  /**
   * Soft-deletes the share by setting `revokedAt`. Idempotent — re-revoking
   * a revoked share returns the existing record (with its original revoked_at).
   * Returns null if not found.
   */
  revoke(token: string): Promise<ShareRecord | null>;

  /**
   * Atomically records a view IF no view bucket exists for this token in the
   * current windowMs-wide time slice. Returns true if a new view was recorded,
   * false if throttled / missing / revoked.
   *
   * Caller MUST treat this as fire-and-forget per Rule 5 (view tracking
   * never blocks the share-page render).
   */
  trackViewIfNotRecent(token: string, windowMs: number): Promise<boolean>;
}
