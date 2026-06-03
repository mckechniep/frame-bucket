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
  /**
   * The site this share points at.
   * Empty string ('') on transitional records created via the legacy
   * `{ artifactId, name }` input path. Task 19 removes the legacy path.
   */
  siteId: string;
  /**
   * Snapshot of the site's pages at the time the share was created.
   * Empty array on transitional records created via the legacy
   * `{ artifactId, name }` input path. Task 19 removes the legacy path.
   */
  pages: SharePageSnapshot[];
  /**
   * @deprecated Transitional field — carried over from the pre-M6 share
   * shape where shares pointed at a single artifact. This field is still
   * populated by the legacy `{ artifactId, name }` create path so that
   * callers (api/share route, /shares components, wizard) continue to
   * compile until Tasks 15-19 migrate them to site-scoping. Task 19
   * removes this field and the legacy create path entirely.
   */
  artifactId: string;
  name: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  createdAt: string;
}

/**
 * Input for creating a new share.
 *
 * Two shapes are accepted during the M6 transition period:
 *  - New (site-scoped): `{ siteId, name, pages }` — pins a snapshot of the
 *    site's current page manifest. This is the shape Tasks 15-19 will migrate
 *    all callers to.
 *  - Legacy (transitional): `{ artifactId, name }` — carried over from M5 so
 *    the api/share route and wizard compile without changes until Task 19.
 *    Records created via the legacy path have `siteId: ''` and `pages: []`.
 *
 * Task 19 removes the legacy branch of this union.
 */
export type CreateShareInput =
  | { siteId: string; name: string; pages: SharePageSnapshot[] }
  | { artifactId: string; name: string };

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
   * Accepts either the new site-scoped input `{ siteId, name, pages }` or
   * the legacy transitional input `{ artifactId, name }`. See
   * {@link CreateShareInput} for details.
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
