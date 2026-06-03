import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseShareStore } from '../share-store-supabase';
import { supabaseServer } from '@/lib/supabase/client-server';

vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(),
}));

const supabaseServerMock = supabaseServer as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Chain builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable mock that Supabase's fluent API expects.
 * Each fluent method gets its OWN vi.fn so tests can assert per-method
 * (e.g. `expect(chain.update).not.toHaveBeenCalled()`).
 */
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
  // For calls that resolve the chain as a promise directly (e.g. `.insert(rows)`)
  chain.then = (resolve: (v: unknown) => unknown) => resolve(finalResult);
  return chain;
}

function mockSupabase(fromImpl: (table: string) => unknown): void {
  supabaseServerMock.mockReturnValue({ from: vi.fn(fromImpl) });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

function makeShareRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    token: 'ABCDEFGHIJKLMNOx',
    site_id: 'site-123',
    name: 'My Share',
    revoked_at: null,
    last_viewed_at: null,
    view_count: 0,
    created_at: NOW,
    ...overrides,
  };
}

function makePageRows(token = 'ABCDEFGHIJKLMNOx'): Record<string, unknown>[] {
  return [
    { token, slug: 'home', title: 'Home', artifact_id: 'art-1', position: 0 },
    { token, slug: 'about', title: 'About', artifact_id: 'art-2', position: 1 },
  ];
}

// ---------------------------------------------------------------------------
// Helper: build a mockSupabase that routes shares / share_pages / anything else
// ---------------------------------------------------------------------------

/**
 * Standard two-table mock: sharesChain for 'shares', pagesChain for 'share_pages'.
 * All other tables (share_view_buckets, etc.) fall through to `fallback`.
 */
function mockTwoTable(
  sharesChain: Record<string, unknown>,
  pagesChain: Record<string, unknown>,
  fallback?: Record<string, unknown>,
): void {
  mockSupabase((table: string) => {
    if (table === 'shares') return sharesChain;
    if (table === 'share_pages') return pagesChain;
    return fallback ?? makeChain({ data: null, error: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseServerMock.mockReset();
});

// ===========================================================================
// Tests
// ===========================================================================

describe('SupabaseShareStore', () => {
  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    describe('new site-scoped path { siteId, name, pages }', () => {
      it('inserts shares row AND share_pages rows', async () => {
        const pages = [
          { slug: 'home', title: 'Home', artifactId: 'art-1', position: 0 },
          { slug: 'about', title: 'About', artifactId: 'art-2', position: 1 },
        ];

        // shares: insert resolves ok; select.eq.single returns row
        const sharesInsert = vi.fn().mockResolvedValue({ error: null });
        const sharesFetch = vi.fn().mockResolvedValue({
          data: makeShareRow({ site_id: 'site-123' }),
          error: null,
        });
        const sharesChain: Record<string, unknown> = {
          insert: sharesInsert,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: sharesFetch })),
          })),
          delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        };

        // share_pages: insert resolves ok
        const pagesInsert = vi.fn().mockResolvedValue({ error: null });
        const pagesChain: Record<string, unknown> = { insert: pagesInsert };

        mockTwoTable(sharesChain, pagesChain);

        const store = new SupabaseShareStore();
        const record = await store.create({ siteId: 'site-123', name: 'My Share', pages });

        // shares insert called once
        expect(sharesInsert).toHaveBeenCalledTimes(1);
        const [shareInsertArg] = (sharesInsert as ReturnType<typeof vi.fn>).mock.calls[0] as [
          Record<string, unknown>,
        ];
        expect(shareInsertArg).toMatchObject({ site_id: 'site-123', name: 'My Share' });
        expect(typeof shareInsertArg.token).toBe('string');

        // share_pages insert called once with correct rows
        expect(pagesInsert).toHaveBeenCalledTimes(1);
        const [pageInsertArg] = (pagesInsert as ReturnType<typeof vi.fn>).mock.calls[0] as [
          unknown[],
        ];
        expect(pageInsertArg).toHaveLength(2);
        expect(pageInsertArg[0]).toMatchObject({
          slug: 'home',
          title: 'Home',
          artifact_id: 'art-1',
          position: 0,
        });
        expect(pageInsertArg[1]).toMatchObject({
          slug: 'about',
          title: 'About',
          artifact_id: 'art-2',
          position: 1,
        });

        // returned record has pages populated from input
        expect(record.siteId).toBe('site-123');
        expect(record.pages).toHaveLength(2);
        expect(record.pages[0]).toMatchObject({ slug: 'home', artifactId: 'art-1' });
        expect(record.pages[1]).toMatchObject({ slug: 'about', artifactId: 'art-2' });
      });

      it('rolls back the shares row when share_pages insert fails', async () => {
        const pages = [{ slug: 'home', title: 'Home', artifactId: 'art-1', position: 0 }];

        const capturedToken = { value: '' };
        const sharesInsert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedToken.value = row.token as string;
          return Promise.resolve({ error: null });
        });
        const eqFn = vi.fn().mockResolvedValue({ error: null });
        const deleteFn = vi.fn().mockReturnValue({ eq: eqFn });
        const sharesChain: Record<string, unknown> = {
          insert: sharesInsert,
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
          delete: deleteFn,
        };

        // share_pages insert errors
        const pagesInsert = vi.fn().mockResolvedValue({ error: { message: 'fk violation' } });
        const pagesChain: Record<string, unknown> = { insert: pagesInsert };

        mockTwoTable(sharesChain, pagesChain);

        const store = new SupabaseShareStore();
        await expect(store.create({ siteId: 'site-123', name: 'My Share', pages })).rejects.toThrow(
          /fk violation/,
        );

        // DELETE was called on shares to roll back, with the correct token
        expect(deleteFn).toHaveBeenCalledTimes(1);
        expect(eqFn).toHaveBeenCalledWith('token', capturedToken.value);
      });

      it('throws before inserting anything when pages array is empty', async () => {
        const insertFn = vi.fn();
        mockSupabase(() => ({ insert: insertFn }));

        const store = new SupabaseShareStore();
        await expect(
          store.create({ siteId: 'site-123', name: 'No Pages', pages: [] }),
        ).rejects.toThrow(/pages must not be empty/);

        // Nothing should have been inserted
        expect(insertFn).not.toHaveBeenCalled();
      });

      it('does not insert share_pages for the legacy path', async () => {
        const chain = makeChain({
          data: makeShareRow({ site_id: 'art-legacy' }),
          error: null,
        });
        mockSupabase(() => chain);

        const store = new SupabaseShareStore();
        const record = await store.create({ artifactId: 'art-legacy', name: 'Legacy Share' });

        // artifactId shim still works
        expect(record.artifactId).toBe('art-legacy');
        // pages is empty for legacy path
        expect(record.pages).toHaveLength(0);
        // share_pages table was never touched — chain.insert is the shares insert
        // (legacy path uses the chained .insert().select().single() shape)
        expect(chain.insert).toHaveBeenCalledTimes(1);
      });
    });

    describe('legacy path { artifactId, name }', () => {
      it('inserts a row and returns a mapped ShareRecord with empty pages', async () => {
        const chain = makeChain({
          data: makeShareRow({ site_id: 'art-123', name: 'My Share' }),
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
        expect(record.pages).toHaveLength(0);
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
  });

  // =========================================================================
  // findByToken
  // =========================================================================
  describe('findByToken', () => {
    it('returns null when token not found', async () => {
      const sharesChain = makeChain({ data: null, error: null });
      const pagesChain = makeChain({ data: [], error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      const result = await store.findByToken('missing');
      expect(result).toBeNull();
    });

    it('returns mapped ShareRecord with ordered pages when found', async () => {
      const sharesChain = makeChain({ data: makeShareRow(), error: null });
      const pagesChain = makeChain({ data: makePageRows(), error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      const result = await store.findByToken('ABCDEFGHIJKLMNOx');

      expect(result).not.toBeNull();
      expect(result?.token).toBe('ABCDEFGHIJKLMNOx');
      expect(result?.viewCount).toBe(0);
      expect(result?.pages).toHaveLength(2);
      expect(result?.pages[0]).toMatchObject({ slug: 'home', artifactId: 'art-1', position: 0 });
      expect(result?.pages[1]).toMatchObject({ slug: 'about', artifactId: 'art-2', position: 1 });
    });

    it('returns record with empty pages when share has no pages', async () => {
      const sharesChain = makeChain({ data: makeShareRow(), error: null });
      const pagesChain = makeChain({ data: [], error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      const result = await store.findByToken('ABCDEFGHIJKLMNOx');

      expect(result?.pages).toHaveLength(0);
    });

    it('propagates Supabase errors on shares query', async () => {
      const sharesChain = makeChain({ error: { message: 'connection failed' } });
      const pagesChain = makeChain({ data: [], error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      await expect(store.findByToken('test')).rejects.toThrow(/connection failed/);
    });

    it('propagates Supabase errors on pages query', async () => {
      const sharesChain = makeChain({ data: makeShareRow(), error: null });
      const pagesChain = makeChain({ error: { message: 'pages query failed' } });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      await expect(store.findByToken('ABCDEFGHIJKLMNOx')).rejects.toThrow(/pages query failed/);
    });
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('returns empty array when no shares exist (no pages query)', async () => {
      const pagesIn = vi.fn();
      const sharesChain = makeChain({ data: [], error: null });
      mockSupabase((table: string) => {
        if (table === 'shares') return sharesChain;
        if (table === 'share_pages') return { select: vi.fn(() => ({ in: pagesIn })) };
        return makeChain({ error: null });
      });

      const store = new SupabaseShareStore();
      const result = await store.list();

      expect(result).toEqual([]);
      // pages query must NOT be issued when there are no shares
      expect(pagesIn).not.toHaveBeenCalled();
    });

    it('fetches pages in a single .in() query (not N queries)', async () => {
      const olderTime = new Date(Date.now() - 1_000_000).toISOString();
      const sharesData = [
        makeShareRow({ token: 'tok-1', created_at: NOW }),
        makeShareRow({ token: 'tok-2', created_at: olderTime }),
      ];

      const pagesData = [
        ...makePageRows('tok-1'),
        { token: 'tok-2', slug: 'home', title: 'Home 2', artifact_id: 'art-3', position: 0 },
      ];

      // Track how many times from('share_pages') is called
      let pagesFromCount = 0;
      const pagesInFn = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: pagesData, error: null }),
      });

      mockSupabase((table: string) => {
        if (table === 'shares') return makeChain({ data: sharesData, error: null });
        if (table === 'share_pages') {
          pagesFromCount++;
          return {
            select: vi.fn(() => ({
              in: pagesInFn,
            })),
          };
        }
        return makeChain({ error: null });
      });

      const store = new SupabaseShareStore();
      const result = await store.list();

      // Only ONE query to share_pages
      expect(pagesFromCount).toBe(1);
      // .in() called with both tokens
      expect(pagesInFn).toHaveBeenCalledTimes(1);
      const [, tokens] = (pagesInFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        string[],
      ];
      expect(tokens).toContain('tok-1');
      expect(tokens).toContain('tok-2');

      // Records have correct pages grouped by token
      expect(result).toHaveLength(2);
      const tok1 = result.find((r) => r.token === 'tok-1');
      const tok2 = result.find((r) => r.token === 'tok-2');
      expect(tok1?.pages).toHaveLength(2);
      expect(tok2?.pages).toHaveLength(1);
    });

    it('returns shares sorted by created_at descending', async () => {
      const olderTime = new Date(Date.now() - 1_000_000).toISOString();
      const sharesData = [
        makeShareRow({ token: 'newer', created_at: NOW }),
        makeShareRow({ token: 'older', created_at: olderTime }),
      ];

      mockSupabase((table: string) => {
        if (table === 'shares') return makeChain({ data: sharesData, error: null });
        if (table === 'share_pages') {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            })),
          };
        }
        return makeChain({ error: null });
      });

      const store = new SupabaseShareStore();
      const result = await store.list();

      expect(result).toHaveLength(2);
      expect(result[0]?.token).toBe('newer');
      expect(result[1]?.token).toBe('older');
    });

    it('propagates Supabase errors on shares query', async () => {
      const sharesChain = makeChain({ error: { message: 'query failed' } });
      mockSupabase(() => sharesChain);

      const store = new SupabaseShareStore();
      await expect(store.list()).rejects.toThrow(/query failed/);
    });

    it('propagates Supabase errors on pages query', async () => {
      const sharesData = [makeShareRow({ token: 'tok-1' })];

      mockSupabase((table: string) => {
        if (table === 'shares') return makeChain({ data: sharesData, error: null });
        if (table === 'share_pages') {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: null, error: { message: 'pages fail' } }),
              }),
            })),
          };
        }
        return makeChain({ error: null });
      });

      const store = new SupabaseShareStore();
      await expect(store.list()).rejects.toThrow(/pages fail/);
    });
  });

  // =========================================================================
  // rename
  // =========================================================================
  describe('rename', () => {
    it('returns null when token not found', async () => {
      const sharesChain = makeChain({ data: null, error: null });
      const pagesChain = makeChain({ data: [], error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      const result = await store.rename('missing', 'New Name');

      expect(result).toBeNull();
    });

    it('returns updated record with pages on success', async () => {
      const sharesChain = makeChain({
        data: makeShareRow({ name: 'Updated Name' }),
        error: null,
      });
      const pagesChain = makeChain({ data: makePageRows(), error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      const result = await store.rename('ABCDEFGHIJKLMNOx', 'Updated Name');

      expect(result?.name).toBe('Updated Name');
      expect(result?.pages).toHaveLength(2);
    });

    it('propagates Supabase errors', async () => {
      const sharesChain = makeChain({ error: { message: 'update failed' } });
      mockSupabase(() => sharesChain);

      const store = new SupabaseShareStore();
      await expect(store.rename('ABCDEFGHIJKLMNOx', 'New Name')).rejects.toThrow(/update failed/);
    });
  });

  // =========================================================================
  // revoke
  // =========================================================================
  describe('revoke', () => {
    it('returns null when token not found', async () => {
      // findByToken returns null → shares maybeSingle returns null
      const sharesChain = makeChain({ data: null, error: null });
      const pagesChain = makeChain({ data: [], error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      const result = await store.revoke('missing');

      expect(result).toBeNull();
    });

    it('is idempotent: revoking an already-revoked share returns existing record without calling update', async () => {
      const revokedTime = new Date().toISOString();
      // shares maybeSingle returns already-revoked row (used by findByToken)
      const sharesChain = makeChain({
        data: makeShareRow({ revoked_at: revokedTime }),
        error: null,
      });
      const pagesChain = makeChain({ data: [], error: null });
      mockTwoTable(sharesChain, pagesChain);

      const store = new SupabaseShareStore();
      const result = await store.revoke('ABCDEFGHIJKLMNOx');

      expect(result?.revokedAt).toBe(revokedTime);
      // Idempotency invariant: update must not be called
      expect(sharesChain.update).not.toHaveBeenCalled();
    });

    it('sets revoked_at and returns updated record with pages on first revoke', async () => {
      const revokedTime = new Date().toISOString();
      const unrevokedRow = makeShareRow({ revoked_at: null });
      const revokedRow = makeShareRow({ revoked_at: revokedTime });

      // findByToken: shares.select().eq().maybeSingle() → unrevoked
      // revoke update: shares.update().eq().select().maybeSingle() → revoked
      // revoke pages fetch: share_pages.select().eq().order() → pages

      let sharesCallCount = 0;
      const sharesFromFn = vi.fn(() => {
        sharesCallCount++;
        if (sharesCallCount === 1) {
          // findByToken call
          return makeChain({ data: unrevokedRow, error: null });
        }
        // revoke update call
        return makeChain({ data: revokedRow, error: null });
      });

      const pagesChain = makeChain({ data: makePageRows(), error: null });

      mockSupabase((table: string) => {
        if (table === 'shares') return sharesFromFn();
        if (table === 'share_pages') return pagesChain;
        return makeChain({ error: null });
      });

      const store = new SupabaseShareStore();
      const result = await store.revoke('ABCDEFGHIJKLMNOx');

      expect(result?.revokedAt).toBe(revokedTime);
      expect(result?.token).toBe('ABCDEFGHIJKLMNOx');
      expect(result?.pages).toHaveLength(2);
    });

    it('propagates Supabase errors from findByToken', async () => {
      const sharesChain = makeChain({ error: { message: 'revoke failed' } });
      mockSupabase(() => sharesChain);

      const store = new SupabaseShareStore();
      await expect(store.revoke('ABCDEFGHIJKLMNOx')).rejects.toThrow(/revoke failed/);
    });
  });

  // =========================================================================
  // trackViewIfNotRecent
  // =========================================================================
  describe('trackViewIfNotRecent', () => {
    /**
     * Helper: set up a standard trackViewIfNotRecent mock where findByToken
     * succeeds with an unrevoked share.
     */
    function mockTrackView({
      shareRow = makeShareRow(),
      bucketResult = { error: null },
      selectResult = { data: { view_count: 5 }, error: null },
      updateResult = { error: null },
    }: {
      shareRow?: Record<string, unknown>;
      bucketResult?: { error: unknown };
      selectResult?: { data: unknown; error: unknown };
      updateResult?: { error: unknown };
    } = {}): {
      bucketInsert: ReturnType<typeof vi.fn>;
    } {
      const bucketInsert = vi.fn().mockResolvedValue(bucketResult);

      const selectChain = makeChain(selectResult);
      const updateChain = makeChain(updateResult);
      // shares for findByToken
      const pagesChain = makeChain({ data: [], error: null });

      let sharesCallCount = 0;
      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') return { insert: bucketInsert };
        if (table === 'share_pages') return pagesChain;
        if (table === 'shares') {
          sharesCallCount++;
          // First call: findByToken (maybeSingle path)
          if (sharesCallCount === 1) return makeChain({ data: shareRow, error: null });
          // Second call: select view_count
          if (sharesCallCount === 2) return selectChain;
          // Third call: update
          return updateChain;
        }
        return makeChain({ error: null });
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });
      return { bucketInsert };
    }

    it('returns true and bumps counter on first view in window', async () => {
      mockTrackView();

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(true);
    });

    it('returns false on 23505 unique violation (throttled)', async () => {
      mockTrackView({ bucketResult: { error: { code: '23505' } } });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(false);
    });

    it('returns false for a missing token (cross-backend parity)', async () => {
      const bucketInsert = vi.fn();
      const pagesChain = makeChain({ data: [], error: null });

      mockSupabase((table: string) => {
        if (table === 'share_view_buckets') return { insert: bucketInsert };
        if (table === 'share_pages') return pagesChain;
        return makeChain({ data: null, error: null });
      });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('missing', 60000);

      expect(result).toBe(false);
      expect(bucketInsert).not.toHaveBeenCalled();
    });

    it('returns false for a revoked share (cross-backend parity)', async () => {
      const { bucketInsert } = mockTrackView({
        shareRow: makeShareRow({ revoked_at: new Date().toISOString() }),
      });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(false);
      expect(bucketInsert).not.toHaveBeenCalled();
    });

    it('returns true even when counter update fails (Rule 5: bucket is source of truth)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockTrackView({ updateResult: { error: { message: 'update failed' } } });

      const store = new SupabaseShareStore();
      const result = await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000);

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('counter update failed'));
      consoleSpy.mockRestore();
    });

    it('propagates non-23505 bucket insert errors', async () => {
      mockTrackView({
        bucketResult: { error: { code: 'SOME_OTHER_ERROR', message: 'bucket error' } },
      });

      const store = new SupabaseShareStore();
      await expect(store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', 60000)).rejects.toThrow(
        /bucket error/,
      );
    });

    it('computes bucket correctly with deterministic time', async () => {
      let capturedBucket: string | undefined;
      const selectChain = makeChain({ data: { view_count: 0 }, error: null });
      const updateChain = makeChain({ error: null });
      const pagesChain = makeChain({ data: [], error: null });

      let sharesCallCount = 0;
      const fromFn = vi.fn((table: string) => {
        if (table === 'share_view_buckets') {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              capturedBucket = row.bucket_started_at as string;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'share_pages') return pagesChain;
        if (table === 'shares') {
          sharesCallCount++;
          if (sharesCallCount === 1) return makeChain({ data: makeShareRow(), error: null });
          if (sharesCallCount === 2) return selectChain;
          return updateChain;
        }
        return makeChain({ error: null });
      });

      supabaseServerMock.mockReturnValue({ from: fromFn });

      vi.useFakeTimers();
      const testTime = new Date('2026-05-18T10:30:45.000Z');
      vi.setSystemTime(testTime);

      const windowMs = 60_000;
      const expectedBucketMs = Math.floor(testTime.getTime() / windowMs) * windowMs;
      const expectedBucketIso = new Date(expectedBucketMs).toISOString();

      const store = new SupabaseShareStore();
      await store.trackViewIfNotRecent('ABCDEFGHIJKLMNOx', windowMs);

      expect(capturedBucket).toBe(expectedBucketIso);

      vi.useRealTimers();
    });
  });
});
