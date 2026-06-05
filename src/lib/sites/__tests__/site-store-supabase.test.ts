import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseSiteStore } from '../site-store-supabase';
import { supabaseServer } from '@/lib/supabase/client-server';

vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(),
}));

const supabaseServerMock = supabaseServer as unknown as ReturnType<typeof vi.fn>;

// Helper: build the chainable mock that Supabase's fluent API expects.
// Each fluent method gets its OWN vi.fn so tests can assert per-method.
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
  chain.order = vi.fn().mockResolvedValue(finalResult);
  chain.insert = makeFluent();
  chain.update = makeFluent();
  chain.delete = makeFluent();
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  chain.single = vi.fn().mockResolvedValue(finalResult);
  // For .insert() which returns a promise directly (when no .select/.single chained)
  chain.then = (resolve: (v: unknown) => unknown) => resolve(finalResult);
  return chain;
}

function mockSupabase(fromImpl: (table: string) => unknown): void {
  supabaseServerMock.mockReturnValue({ from: vi.fn(fromImpl) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Shared row fixtures
// ---------------------------------------------------------------------------

function makeSiteRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'site-aabbcc112233',
    name: 'Test Site',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePageRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    site_id: 'site-aabbcc112233',
    slug: '/home',
    title: 'Home',
    artifact_id: 'art-abc',
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createSite
// ---------------------------------------------------------------------------

describe('SupabaseSiteStore', () => {
  describe('createSite', () => {
    it('generates a valid site-<hex12> id and maps the returned row', async () => {
      const row = makeSiteRow();
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await store.createSite({ name: 'Test Site' });

      // Verify the store generated a valid ID and passed it to insert()
      const insertFn = chain.insert as ReturnType<typeof vi.fn>;
      const insertedPayload = insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(insertedPayload.id).toMatch(/^site-[0-9a-f]{12}$/);
    });

    it('maps the returned row fields correctly', async () => {
      const row = makeSiteRow();
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const record = await store.createSite({ name: 'Test Site' });

      // These verify row-mapping, not ID generation
      expect(record.id).toBe('site-aabbcc112233');
      expect(record.name).toBe('Test Site');
      expect(record.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(record.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'insert failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await expect(store.createSite({ name: 'Bad Site' })).rejects.toThrow(/insert failed/);
    });
  });

  // ---------------------------------------------------------------------------
  // getSite
  // ---------------------------------------------------------------------------

  describe('getSite', () => {
    it('returns null when site not found', async () => {
      const chain = makeChain({ data: null, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const result = await store.getSite('site-missing');
      expect(result).toBeNull();
    });

    it('returns mapped SiteRecord when found', async () => {
      const row = makeSiteRow({ id: 'site-aabbcc112233', name: 'Found Site' });
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const result = await store.getSite('site-aabbcc112233');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('site-aabbcc112233');
      expect(result?.name).toBe('Found Site');
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'connection failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await expect(store.getSite('site-123')).rejects.toThrow(/connection failed/);
    });
  });

  // ---------------------------------------------------------------------------
  // addPage
  // ---------------------------------------------------------------------------

  describe('addPage', () => {
    it('inserts a page row and returns a mapped SitePage', async () => {
      const row = makePageRow();
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const page = await store.addPage('site-aabbcc112233', {
        slug: '/home',
        title: 'Home',
        artifactId: 'art-abc',
        position: 0,
      });

      expect(page.siteId).toBe('site-aabbcc112233');
      expect(page.slug).toBe('/home');
      expect(page.title).toBe('Home');
      expect(page.artifactId).toBe('art-abc');
      expect(page.position).toBe(0);
      expect(page.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('throws SLUG_EXISTS on 23505 unique violation with exact message format', async () => {
      const chain = makeChain({ error: { code: '23505', message: 'duplicate key value' } });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await expect(
        store.addPage('site-aabbcc112233', {
          slug: '/about',
          title: 'About',
          artifactId: 'art-abc',
          position: 0,
        }),
      ).rejects.toThrow('SLUG_EXISTS: slug "/about" already exists in site site-aabbcc112233');
    });

    it('throws SITE_NOT_FOUND on 23503 FK violation with exact message format', async () => {
      const chain = makeChain({
        error: { code: '23503', message: 'violates foreign key constraint' },
      });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await expect(
        store.addPage('site-unknown', {
          slug: '/home',
          title: 'Home',
          artifactId: 'art-abc',
          position: 0,
        }),
      ).rejects.toThrow('SITE_NOT_FOUND: no site with id site-unknown');
    });

    it('propagates other Supabase errors', async () => {
      const chain = makeChain({ error: { code: 'XX000', message: 'unexpected db error' } });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await expect(
        store.addPage('site-aabbcc112233', {
          slug: '/home',
          title: 'Home',
          artifactId: 'art-abc',
          position: 0,
        }),
      ).rejects.toThrow(/unexpected db error/);
    });
  });

  // ---------------------------------------------------------------------------
  // listPages
  // ---------------------------------------------------------------------------

  describe('listPages', () => {
    it('returns pages ordered by position ascending', async () => {
      const rows = [
        makePageRow({ slug: '/home', position: 0 }),
        makePageRow({ slug: '/about', position: 1 }),
      ];
      const chain = makeChain({ data: rows, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const pages = await store.listPages('site-aabbcc112233');

      expect(pages).toHaveLength(2);
      expect(pages[0]?.slug).toBe('/home');
      expect(pages[1]?.slug).toBe('/about');
    });

    it('returns [] when site has no pages (or site does not exist)', async () => {
      const chain = makeChain({ data: [], error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const pages = await store.listPages('site-missing');

      expect(pages).toEqual([]);
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'query failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await expect(store.listPages('site-aabbcc112233')).rejects.toThrow(/query failed/);
    });
  });

  // ---------------------------------------------------------------------------
  // setPageArtifact
  // ---------------------------------------------------------------------------

  describe('setPageArtifact', () => {
    it('returns updated SitePage on success', async () => {
      const row = makePageRow({ artifact_id: 'art-new' });
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const result = await store.setPageArtifact('site-aabbcc112233', '/home', 'art-new');

      expect(result).not.toBeNull();
      expect(result?.artifactId).toBe('art-new');
    });

    it('returns null when no row matched (unknown site or slug)', async () => {
      const chain = makeChain({ data: null, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      const result = await store.setPageArtifact('site-missing', '/nope', 'art-xyz');
      expect(result).toBeNull();
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'update failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseSiteStore();
      await expect(store.setPageArtifact('site-aabbcc112233', '/home', 'art-new')).rejects.toThrow(
        /update failed/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // removePage
  // ---------------------------------------------------------------------------

  describe('removePage', () => {
    it('returns true when the page was deleted', async () => {
      // Supabase delete returns the deleted rows via .delete().eq().eq().select()
      const deleteChain: Record<string, unknown> = {};
      deleteChain.eq = vi.fn(() => deleteChain);
      deleteChain.select = vi.fn().mockResolvedValue({ data: [makePageRow()], error: null });

      const fromFn = vi.fn(() => ({
        delete: vi.fn(() => deleteChain),
      }));
      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseSiteStore();
      const result = await store.removePage('site-aabbcc112233', '/home');
      expect(result).toBe(true);
    });

    it('returns false when no row was deleted (unknown site/slug)', async () => {
      const deleteChain: Record<string, unknown> = {};
      deleteChain.eq = vi.fn(() => deleteChain);
      deleteChain.select = vi.fn().mockResolvedValue({ data: [], error: null });

      const fromFn = vi.fn(() => ({
        delete: vi.fn(() => deleteChain),
      }));
      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseSiteStore();
      const result = await store.removePage('site-missing', '/nope');
      expect(result).toBe(false);
    });

    it('propagates Supabase errors', async () => {
      const deleteChain: Record<string, unknown> = {};
      deleteChain.eq = vi.fn(() => deleteChain);
      deleteChain.select = vi.fn().mockResolvedValue({ error: { message: 'delete failed' } });

      const fromFn = vi.fn(() => ({
        delete: vi.fn(() => deleteChain),
      }));
      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseSiteStore();
      await expect(store.removePage('site-aabbcc112233', '/home')).rejects.toThrow(/delete failed/);
    });
  });
});
