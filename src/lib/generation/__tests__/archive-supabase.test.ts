import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseArchiveStore } from '../archive-supabase';
import { supabaseServer } from '@/lib/supabase/client-server';

vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(),
}));

const supabaseServerMock = supabaseServer as unknown as ReturnType<typeof vi.fn>;

// Helper: build the chainable mock that Supabase's fluent API expects.
// Each test case configures the final result.
function makeChain(finalResult: {
  data?: unknown;
  error?: unknown;
  count?: number;
}): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const fluent = vi.fn(() => chain);
  for (const method of ['select', 'eq', 'in', 'order', 'insert', 'update', 'delete']) {
    chain[method] = fluent;
  }
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

describe('SupabaseArchiveStore', () => {
  describe('save', () => {
    it('inserts a row and returns a uuid', async () => {
      const chain = makeChain({ error: null });
      const fakeInsert = vi.fn().mockResolvedValue({ error: null });
      chain.insert = fakeInsert;
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      const id = await store.save({
        recipeSummary: 'Editorial — Hex Records',
        html: '<html></html>',
        htmlSource: '<html></html>',
        modelId: 'claude-opus-4-7',
        inputTokens: 100,
        outputTokens: 5000,
        cacheReadTokens: 0,
        cost: 0.42,
        generatedAt: '2026-05-17T00:00:00Z',
        iterationRound: 0,
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/); // uuid shape
      expect(fakeInsert).toHaveBeenCalled();
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'duplicate key' } });
      chain.insert = vi.fn().mockResolvedValue({ error: { message: 'duplicate key' } });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      await expect(
        store.save({
          recipeSummary: 's',
          html: 'h',
          modelId: 'm',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
          generatedAt: '',
        }),
      ).rejects.toThrow(/duplicate key/);
    });

    it('applies (iter N) suffix when iterationRound > 0', async () => {
      const captured: { meta?: unknown } = {};
      const fakeInsert = vi.fn((row: unknown) => {
        Object.assign(captured, row);
        return Promise.resolve({ error: null });
      });
      const fakeFrom = vi.fn(() => ({ insert: fakeInsert }));
      supabaseServerMock.mockReturnValue({ from: fakeFrom });

      const store = new SupabaseArchiveStore();
      await store.save({
        recipeSummary: 'Editorial',
        html: 'h',
        modelId: 'm',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        generatedAt: '',
        iterationRound: 2,
      });
      expect((captured.meta as Record<string, string>).recipeSummary).toBe('Editorial (iter 2)');
    });

    it('strips existing (iter N) suffix before applying new one', async () => {
      const captured: { meta?: unknown } = {};
      const fakeInsert = vi.fn((row: unknown) => {
        Object.assign(captured, row);
        return Promise.resolve({ error: null });
      });
      const fakeFrom = vi.fn(() => ({ insert: fakeInsert }));
      supabaseServerMock.mockReturnValue({ from: fakeFrom });

      const store = new SupabaseArchiveStore();
      await store.save({
        recipeSummary: 'Editorial (iter 1)',
        html: 'h',
        modelId: 'm',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        generatedAt: '',
        iterationRound: 2,
      });
      expect((captured.meta as Record<string, string>).recipeSummary).toBe('Editorial (iter 2)');
    });
  });

  describe('exists', () => {
    it('returns true when count > 0', async () => {
      const chain = makeChain({ count: 1, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      expect(await store.exists('abc')).toBe(true);
    });

    it('returns false when count is 0', async () => {
      const chain = makeChain({ count: 0, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      expect(await store.exists('abc')).toBe(false);
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'connection failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      await expect(store.exists('abc')).rejects.toThrow(/connection failed/);
    });
  });

  describe('existsMany', () => {
    it('returns empty Set for empty input without hitting Supabase', async () => {
      const fromSpy = vi.fn();
      supabaseServerMock.mockReturnValue({ from: fromSpy });

      const store = new SupabaseArchiveStore();
      const result = await store.existsMany([]);
      expect(result.size).toBe(0);
      expect(fromSpy).not.toHaveBeenCalled();
    });

    it('returns set of ids that exist', async () => {
      const chain = makeChain({ data: [{ id: 'a' }, { id: 'c' }], error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      const result = await store.existsMany(['a', 'b', 'c']);
      expect(result).toEqual(new Set(['a', 'c']));
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'query failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      await expect(store.existsMany(['a', 'b'])).rejects.toThrow(/query failed/);
    });
  });

  describe('read', () => {
    it('returns null when row is missing', async () => {
      const chain = makeChain({ data: null, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      expect(await store.read('missing')).toBeNull();
    });

    it('maps row to ArchiveRecord', async () => {
      const row = {
        id: 'abc',
        html: '<x />',
        html_source: '<x />',
        meta: {
          recipeSummary: 'Editorial',
          modelId: 'claude-opus-4-7',
          inputTokens: 100,
          outputTokens: 500,
          cacheReadTokens: 50,
          cost: 1.23,
          generatedAt: '2026-05-17T00:00:00Z',
        },
        parent_id: null,
        iteration_round: 0,
        created_at: '2026-05-17T00:00:00Z',
      };
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      const result = await store.read('abc');
      expect(result?.recipeSummary).toBe('Editorial');
      expect(result?.cost).toBe(1.23);
      expect(result?.parentArtifactId).toBeUndefined();
      expect(result?.iterationRound).toBe(0);
    });

    it('includes parentArtifactId when parent_id is set', async () => {
      const row = {
        id: 'child',
        html: '<x />',
        html_source: null,
        meta: {
          recipeSummary: '',
          modelId: '',
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
          generatedAt: '',
        },
        parent_id: 'parent',
        iteration_round: 1,
        created_at: '2026-05-17T00:00:00Z',
      };
      const chain = makeChain({ data: row as unknown, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      const result = await store.read('child');
      expect(result?.parentArtifactId).toBe('parent');
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'read failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      await expect(store.read('abc')).rejects.toThrow(/read failed/);
    });
  });

  describe('getChildren', () => {
    it('returns sorted children with id field attached', async () => {
      const data = [
        {
          id: 'child2',
          html: '',
          html_source: null,
          meta: {
            recipeSummary: '',
            modelId: '',
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cost: 0,
            generatedAt: '',
          },
          parent_id: 'p',
          iteration_round: 2,
          created_at: '',
        },
        {
          id: 'child1',
          html: '',
          html_source: null,
          meta: {
            recipeSummary: '',
            modelId: '',
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cost: 0,
            generatedAt: '',
          },
          parent_id: 'p',
          iteration_round: 1,
          created_at: '',
        },
      ] as unknown[];
      const chain = makeChain({ data, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      const result = await store.getChildren('p');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('child2');
      expect(result[1]?.id).toBe('child1');
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'children query failed' } });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      await expect(store.getChildren('p')).rejects.toThrow(/children query failed/);
    });

    it('returns empty array when parent has no children', async () => {
      const chain = makeChain({ data: [], error: null });
      mockSupabase(() => chain);

      const store = new SupabaseArchiveStore();
      const result = await store.getChildren('p');
      expect(result).toHaveLength(0);
    });
  });
});
