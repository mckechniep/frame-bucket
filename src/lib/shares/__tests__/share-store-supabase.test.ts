import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseShareStore } from '../share-store-supabase';
import { supabaseServer } from '@/lib/supabase/client-server';

vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(),
}));

const supabaseServerMock = supabaseServer as unknown as ReturnType<typeof vi.fn>;

// Helper: build the chainable mock that Supabase's fluent API expects.
// Each fluent method gets its OWN vi.fn so tests can assert per-method
// (e.g. `expect(chain.update).not.toHaveBeenCalled()`). Sharing a single
// fluent mock across methods conflates call counts in surprising ways.
function makeChain(finalResult: {
  data?: unknown;
  error?: unknown;
  count?: number;
}): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const makeFluent = () => vi.fn(() => chain);
  chain.select = makeFluent();
  chain.eq = makeFluent();
  chain.in = makeFluent();
  chain.order = makeFluent();
  chain.insert = makeFluent();
  chain.update = makeFluent();
  chain.delete = makeFluent();
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  chain.single = vi.fn().mockResolvedValue(finalResult);
  // For .insert() which returns a promise directly
  chain.then = (resolve: (v: unknown) => unknown) => resolve(finalResult);
  return chain;
}

function mockSupabase(fromImpl: (table: string) => unknown): void {
  supabaseServerMock.mockReturnValue({ from: vi.fn(fromImpl) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SupabaseShareStore', () => {
  describe('create', () => {
    it('inserts a row and returns a mapped ShareRecord', async () => {
      const now = new Date().toISOString();
      const chain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-123',
          name: 'My Share',
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
          created_at: now,
        },
        error: null,
      });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const record = await store.create({ artifactId: 'art-123', name: 'My Share' });

      expect(record.token).toBe('ABCDEFGHIJKLMNOx');
      expect(record.artifactId).toBe('art-123');
      expect(record.name).toBe('My Share');
      expect(record.revokedAt).toBeNull();
      expect(record.viewCount).toBe(0);
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'duplicate token' } });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      await expect(store.create({ artifactId: 'art-123', name: 'My Share' })).rejects.toThrow(
        /duplicate token/,
      );
    });
  });

  describe('findByToken', () => {
    it('returns null when token not found', async () => {
      const chain = makeChain({ data: null, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.findByToken('missing');
      expect(result).toBeNull();
    });

    it('returns mapped ShareRecord when found', async () => {
      const now = new Date().toISOString();
      const chain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-123',
          name: 'Found Share',
          revoked_at: null,
          last_viewed_at: now,
          view_count: 5,
          created_at: now,
        },
        error: null,
      });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.findByToken('ABCDEFGHIJKLMNOx');

      expect(result).not.toBeNull();
      expect(result?.token).toBe('ABCDEFGHIJKLMNOx');
      expect(result?.viewCount).toBe(5);
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'connection failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      await expect(store.findByToken('test')).rejects.toThrow(/connection failed/);
    });
  });

  describe('list', () => {
    it('returns empty array when no shares exist', async () => {
      const chain = makeChain({ data: [], error: null });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.list();

      expect(result).toEqual([]);
    });

    it('returns shares sorted by created_at descending', async () => {
      const now = new Date().toISOString();
      const olderTime = new Date(Date.now() - 1000000).toISOString();
      const chain = makeChain({
        data: [
          {
            token: 'newer',
            artifact_id: 'art-1',
            name: 'Newer',
            revoked_at: null,
            last_viewed_at: null,
            view_count: 0,
            created_at: now,
          },
          {
            token: 'older',
            artifact_id: 'art-2',
            name: 'Older',
            revoked_at: null,
            last_viewed_at: null,
            view_count: 0,
            created_at: olderTime,
          },
        ],
        error: null,
      });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.list();

      expect(result).toHaveLength(2);
      expect(result[0]?.token).toBe('newer');
      expect(result[1]?.token).toBe('older');
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'query failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      await expect(store.list()).rejects.toThrow(/query failed/);
    });
  });

  describe('rename', () => {
    it('returns null when token not found', async () => {
      const chain = makeChain({ data: null, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.rename('missing', 'New Name');

      expect(result).toBeNull();
    });

    it('returns updated record on success', async () => {
      const now = new Date().toISOString();
      const chain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-123',
          name: 'Updated Name',
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
          created_at: now,
        },
        error: null,
      });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.rename('ABCDEFGHIJKLMNOx', 'Updated Name');

      expect(result?.name).toBe('Updated Name');
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'update failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      await expect(store.rename('ABCDEFGHIJKLMNOx', 'New Name')).rejects.toThrow(/update failed/);
    });
  });

  describe('revoke', () => {
    it('returns null when token not found', async () => {
      const chain = makeChain({ data: null, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.revoke('missing');

      expect(result).toBeNull();
    });

    it('returns updated record with revoked_at set on first revoke', async () => {
      const now = new Date().toISOString();
      const revokedTime = new Date().toISOString();

      // First call to findByToken returns unrevoked
      const findChain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-123',
          name: 'Share',
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
          created_at: now,
        },
        error: null,
      });

      // Second call to update returns revoked
      const updateChain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-123',
          name: 'Share',
          revoked_at: revokedTime,
          last_viewed_at: null,
          view_count: 0,
          created_at: now,
        },
        error: null,
      });

      const fromFn = vi.fn((table: string) => {
        if (table === 'shares') {
          // Alternate between find and update chains
          let callCount = 0;
          return {
            select: vi.fn(function () {
              callCount++;
              return callCount === 1 ? findChain : updateChain;
            }),
            eq: vi.fn(() => findChain),
            update: vi.fn(() => updateChain),
          };
        }
        return updateChain;
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseShareStore();
      const result = await store.revoke('ABCDEFGHIJKLMNOx');

      expect(result?.revokedAt).not.toBeNull();
      expect(result?.token).toBe('ABCDEFGHIJKLMNOx');
    });

    it('is idempotent: revoking already-revoked share returns existing record without calling update', async () => {
      const now = new Date().toISOString();
      const revokedTime = new Date().toISOString();

      // findByToken returns already-revoked record
      const chain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-123',
          name: 'Share',
          revoked_at: revokedTime,
          last_viewed_at: null,
          view_count: 0,
          created_at: now,
        },
        error: null,
      });

      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      const result = await store.revoke('ABCDEFGHIJKLMNOx');

      expect(result?.revokedAt).toBe(revokedTime);
      // Idempotency invariant: when the share is already revoked, we
      // short-circuit after findByToken and never invoke the update path.
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'revoke failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseShareStore();
      await expect(store.revoke('ABCDEFGHIJKLMNOx')).rejects.toThrow(/revoke failed/);
    });
  });

  describe('trackViewIfNotRecent', () => {
    it('returns true and bumps counter on first view in window', async () => {
      const selectChain = makeChain({
        data: { view_count: 5 },
        error: null,
      });

      const updateChain = makeChain({ error: null });

      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        if (table === 'shares') {
          return {
            select: vi.fn(() => selectChain),
            update: vi.fn(() => updateChain),
          };
        }
        return makeChain({ error: null });
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(true);
    });

    it('returns false on 23505 unique violation (throttled)', async () => {
      // findByToken must succeed first (post-guard); only the bucket insert
      // should hit the 23505 path.
      const sharesChain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-1',
          name: 'n',
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
          created_at: new Date().toISOString(),
        },
        error: null,
      });

      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return {
            insert: vi.fn(() => Promise.resolve({ error: { code: '23505' } })),
          };
        }
        return sharesChain;
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(false);
    });

    it('returns false for a missing token (cross-backend parity)', async () => {
      // findByToken returns null → guard returns false WITHOUT touching the bucket table.
      const sharesChain = makeChain({ data: null, error: null });
      const bucketInsert = vi.fn();

      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return { insert: bucketInsert };
        }
        return sharesChain;
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(false);
      expect(bucketInsert).not.toHaveBeenCalled();
    });

    it('returns false for a revoked share (cross-backend parity)', async () => {
      // Matches MemoryShareStore behavior: revoked shares accumulate no views.
      const sharesChain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-1',
          name: 'n',
          revoked_at: new Date().toISOString(),
          last_viewed_at: null,
          view_count: 0,
          created_at: new Date().toISOString(),
        },
        error: null,
      });
      const bucketInsert = vi.fn();

      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return { insert: bucketInsert };
        }
        return sharesChain;
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(false);
      expect(bucketInsert).not.toHaveBeenCalled();
    });

    it('returns true even when counter update fails (Rule 5: bucket is source of truth)', async () => {
      const selectChain = makeChain({
        data: { view_count: 5 },
        error: null,
      });

      const updateChain = makeChain({
        error: { message: 'update failed' },
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        if (table === 'shares') {
          return {
            select: vi.fn(() => selectChain),
            update: vi.fn(() => updateChain),
          };
        }
        return makeChain({ error: null });
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(true); // Still returns true
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('counter update failed'));

      consoleSpy.mockRestore();
    });

    it('propagates non-23505 bucket insert errors', async () => {
      // findByToken must succeed past the guard before the bucket insert runs.
      const sharesChain = makeChain({
        data: {
          token: 'ABCDEFGHIJKLMNOx',
          artifact_id: 'art-1',
          name: 'n',
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
          created_at: new Date().toISOString(),
        },
        error: null,
      });

      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return {
            insert: vi.fn(() =>
              Promise.resolve({ error: { code: 'SOME_OTHER_ERROR', message: 'bucket error' } }),
            ),
          };
        }
        return sharesChain;
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseShareStore();
      await expect(store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000)).rejects.toThrow(
        /bucket error/,
      );
    });

    it('computes bucket correctly with deterministic time', async () => {
      const selectChain = makeChain({
        data: { view_count: 0 },
        error: null,
      });
      const updateChain = makeChain({ error: null });

      let capturedBucket: string | undefined;

      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              capturedBucket = row.bucket_started_at as string;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'shares') {
          return {
            select: vi.fn(() => selectChain),
            update: vi.fn(() => updateChain),
          };
        }
        return makeChain({ error: null });
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      vi.useFakeTimers();
      const testTime = new Date('2026-05-18T10:30:45.000Z');
      vi.setSystemTime(testTime);

      const windowMs = 60000; // 1 minute
      const expectedBucketMs = Math.floor(testTime.getTime() / windowMs) * windowMs;
      const expectedBucketIso = new Date(expectedBucketMs).toISOString();

      const store = new SupabaseShareStore();
      await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', windowMs);

      expect(capturedBucket).toBe(expectedBucketIso);

      vi.useRealTimers();
    });
  });
});
