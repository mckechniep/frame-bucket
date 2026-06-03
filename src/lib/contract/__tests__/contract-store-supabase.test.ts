import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseContractStore } from '../contract-store-supabase';
import { supabaseServer } from '@/lib/supabase/client-server';
import type { StoredContract, DesignTokens } from '../types';

vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(),
}));

const supabaseServerMock = supabaseServer as unknown as ReturnType<typeof vi.fn>;

// Build a chainable Supabase fluent-API mock. Each method returns the same
// chain object. Terminal methods (.maybeSingle, .single) resolve with finalResult.
function makeChain(finalResult: { data?: unknown; error?: unknown }): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const fluent = () => vi.fn(() => chain);
  chain.select = fluent();
  chain.eq = fluent();
  chain.upsert = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  chain.single = vi.fn().mockResolvedValue(finalResult);
  return chain;
}

function mockSupabase(fromImpl: (table: string) => unknown): void {
  supabaseServerMock.mockReturnValue({ from: vi.fn(fromImpl) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Shared fixtures ──────────────────────────────────────────────────────────

function makeTokens(overrides?: Partial<DesignTokens>): DesignTokens {
  return {
    colors: [{ name: '--color-bg', value: '#ffffff' }],
    fonts: [{ family: 'IBM Plex Serif', weights: [400, 700], role: 'display' }],
    typeScale: [{ name: '--fs-xl', value: '2rem' }],
    spacing: [{ name: '--space-md', value: '1rem' }],
    other: [{ name: '--radius', value: '8px' }],
    meta: { extractedFrom: 'art-test', recipeSummary: 'Test recipe', fallback: false },
    ...overrides,
  };
}

function makeStoredContract(overrides?: Partial<StoredContract>): StoredContract {
  const tokens = makeTokens();
  return {
    tokens,
    contractMd: '# Design Contract\n\n## Identity\nTest.',
    tokensJson: '{"color":{"bg":{"value":"#ffffff"}}}',
    tokensCss: ':root {\n  --color-bg: #ffffff;\n}',
    modelId: 'claude-haiku-4-5',
    cost: 0.0042,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

// The stored row shape: tokens jsonb column stores { designTokens, tokensJson }
function makeContractRow(contract: StoredContract) {
  return {
    artifact_id: 'art-test',
    tokens: { designTokens: contract.tokens, tokensJson: contract.tokensJson },
    contract_md: contract.contractMd,
    tokens_css: contract.tokensCss,
    model_id: contract.modelId,
    cost: contract.cost,
    created_at: contract.createdAt,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SupabaseContractStore', () => {
  describe('get', () => {
    it('returns null when no row found', async () => {
      const chain = makeChain({ data: null, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseContractStore();
      const result = await store.get('art-missing');
      expect(result).toBeNull();
    });

    it('maps a row to StoredContract, reconstructing tokensJson from jsonb', async () => {
      const contract = makeStoredContract();
      const row = makeContractRow(contract);
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseContractStore();
      const result = await store.get('art-test');

      expect(result).not.toBeNull();
      expect(result?.tokens).toEqual(contract.tokens);
      expect(result?.tokensJson).toBe(contract.tokensJson);
      expect(result?.contractMd).toBe(contract.contractMd);
      expect(result?.tokensCss).toBe(contract.tokensCss);
      expect(result?.modelId).toBe(contract.modelId);
      expect(result?.cost).toBe(contract.cost);
      expect(result?.createdAt).toBe(contract.createdAt);
    });

    it('propagates Supabase errors', async () => {
      const chain = makeChain({ error: { message: 'db error on get' } });
      mockSupabase(() => chain);

      const store = new SupabaseContractStore();
      await expect(store.get('art-test')).rejects.toThrow(/db error on get/);
    });

    it('handles null model_id and null cost gracefully', async () => {
      const contract = makeStoredContract();
      const row = { ...makeContractRow(contract), model_id: null, cost: null };
      const chain = makeChain({ data: row, error: null });
      mockSupabase(() => chain);

      const store = new SupabaseContractStore();
      const result = await store.get('art-test');

      expect(result?.modelId).toBe('');
      expect(result?.cost).toBe(0);
    });
  });

  describe('put', () => {
    it('calls upsert with onConflict: artifact_id', async () => {
      const chain = makeChain({ data: null, error: null });
      const fromFn = vi.fn(() => chain);
      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseContractStore();
      const contract = makeStoredContract();

      await store.put('art-upsert', contract);

      const upsertFn = chain.upsert as ReturnType<typeof vi.fn>;
      expect(upsertFn).toHaveBeenCalledOnce();

      const [payload, opts] = upsertFn.mock.calls[0] as [unknown, unknown];
      expect((opts as Record<string, unknown>).onConflict).toBe('artifact_id');

      // The upserted row must store tokens jsonb as { designTokens, tokensJson }
      const row = payload as Record<string, unknown>;
      expect(row.artifact_id).toBe('art-upsert');
      expect((row.tokens as Record<string, unknown>).designTokens).toEqual(contract.tokens);
      expect((row.tokens as Record<string, unknown>).tokensJson).toBe(contract.tokensJson);
      expect(row.contract_md).toBe(contract.contractMd);
      expect(row.tokens_css).toBe(contract.tokensCss);
      expect(row.model_id).toBe(contract.modelId);
      expect(row.cost).toBe(contract.cost);
    });

    it('propagates Supabase errors from upsert', async () => {
      // The upsert mock needs to resolve with an error
      const upsertFn = vi.fn().mockResolvedValue({ error: { message: 'upsert failed' } });
      const fromFn = vi.fn(() => ({ upsert: upsertFn }));
      supabaseServerMock.mockReturnValue({ from: fromFn });

      const store = new SupabaseContractStore();
      const contract = makeStoredContract();

      await expect(store.put('art-fail', contract)).rejects.toThrow(/upsert failed/);
    });
  });
});
