import type { CreateShareInput, SharePageSnapshot, ShareRecord, ShareStore } from './share-store';
import { generateShareToken } from './token';

interface MemoryRow extends ShareRecord {
  // Set of bucket-start timestamps (ms since epoch, floor of windowMs)
  // that have already been counted. Used by trackViewIfNotRecent to throttle.
  viewBuckets: Set<number>;
}

/** Returns a deep copy of a pages snapshot array. */
function clonePages(pages: SharePageSnapshot[]): SharePageSnapshot[] {
  return pages.map((p) => ({ ...p }));
}

export class MemoryShareStore implements ShareStore {
  private rows = new Map<string, MemoryRow>();

  async create(input: CreateShareInput): Promise<ShareRecord> {
    const token = generateShareToken();
    const now = new Date().toISOString();

    let siteId: string;
    let pages: SharePageSnapshot[];
    let artifactId: string;

    if ('siteId' in input) {
      // New site-scoped path: deep-copy the caller's pages array so mutations
      // to the original after create cannot change the stored snapshot.
      if (input.pages.length === 0) {
        throw new Error('MemoryShareStore.create: pages must not be empty for site-scoped shares');
      }
      siteId = input.siteId;
      pages = clonePages(input.pages);
      artifactId = '';
    } else {
      // Legacy transitional path: { artifactId, name }.
      // Produces a record with siteId '' and pages [] so the field is always
      // populated. Task 19 removes this branch.
      siteId = '';
      pages = [];
      artifactId = input.artifactId;
    }

    const row: MemoryRow = {
      token,
      siteId,
      pages,
      artifactId,
      name: input.name,
      revokedAt: null,
      lastViewedAt: null,
      viewCount: 0,
      createdAt: now,
      viewBuckets: new Set(),
    };
    this.rows.set(token, row);
    return rowToRecord(row);
  }

  async findByToken(token: string): Promise<ShareRecord | null> {
    const row = this.rows.get(token);
    return row ? rowToRecord(row) : null;
  }

  async list(): Promise<ShareRecord[]> {
    return [...this.rows.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(rowToRecord);
  }

  async rename(token: string, name: string): Promise<ShareRecord | null> {
    const row = this.rows.get(token);
    if (!row) return null;
    row.name = name;
    return rowToRecord(row);
  }

  async revoke(token: string): Promise<ShareRecord | null> {
    const row = this.rows.get(token);
    if (!row) return null;
    // Idempotent: don't overwrite an existing revokedAt
    if (!row.revokedAt) row.revokedAt = new Date().toISOString();
    return rowToRecord(row);
  }

  async trackViewIfNotRecent(token: string, windowMs: number): Promise<boolean> {
    const row = this.rows.get(token);
    if (!row || row.revokedAt) return false;
    const bucket = Math.floor(Date.now() / windowMs) * windowMs;
    if (row.viewBuckets.has(bucket)) return false;
    row.viewBuckets.add(bucket);
    row.viewCount += 1;
    row.lastViewedAt = new Date().toISOString();
    return true;
  }
}

function rowToRecord(row: MemoryRow): ShareRecord {
  // Strip the internal viewBuckets Set before returning.
  // Deep-copy pages so callers cannot mutate internal snapshot state.
  // Sort by position ascending to match SupabaseShareStore's ORDER BY position ASC.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { viewBuckets, pages, ...rest } = row;
  return {
    ...rest,
    pages: clonePages(pages).sort((a, b) => a.position - b.position),
  };
}
