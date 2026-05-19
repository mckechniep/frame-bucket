import type { ShareRecord, ShareStore } from './share-store';
import { generateShareToken } from './token';

interface MemoryRow extends ShareRecord {
  // Set of bucket-start timestamps (ms since epoch, floor of windowMs)
  // that have already been counted. Used by trackViewIfNotRecent to throttle.
  viewBuckets: Set<number>;
}

export class MemoryShareStore implements ShareStore {
  private rows = new Map<string, MemoryRow>();

  async create({ artifactId, name }: { artifactId: string; name: string }): Promise<ShareRecord> {
    const token = generateShareToken();
    const now = new Date().toISOString();
    const row: MemoryRow = {
      token,
      artifactId,
      name,
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
  // Strip the internal viewBuckets Set before returning
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { viewBuckets, ...record } = row;
  return record;
}
