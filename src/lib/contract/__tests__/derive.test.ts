import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoredContract, DesignTokens } from '../types';
import type { ContractStore } from '../contract-store';
import type { ArchiveRecord } from '@/lib/generation/archive';

// ── Mock all IO + LLM boundaries ─────────────────────────────────────────────

// Mock the contract store factory so we can control cache behavior
vi.mock('../contract-store-factory', () => ({
  defaultContractStore: vi.fn(),
}));

// Mock the archive factory so we can control artifact reads
vi.mock('@/lib/generation/archive-factory', () => ({
  defaultArchiveStore: vi.fn(),
}));

// Mock the narrative module (billable LLM call)
vi.mock('../narrative', () => ({
  generateNarrative: vi.fn(),
}));

import { defaultContractStore } from '../contract-store-factory';
import { defaultArchiveStore } from '@/lib/generation/archive-factory';
import { generateNarrative } from '../narrative';
import { deriveContract } from '../derive';

const mockDefaultContractStore = defaultContractStore as ReturnType<typeof vi.fn>;
const mockDefaultArchiveStore = defaultArchiveStore as ReturnType<typeof vi.fn>;
const mockGenerateNarrative = generateNarrative as ReturnType<typeof vi.fn>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeArchiveRecord(overrides?: Partial<ArchiveRecord>): ArchiveRecord {
  return {
    recipeSummary: 'A cyberpunk landing page',
    html: '<html><head><style>:root { --color-bg: #000; --font-display: "Rajdhani", sans-serif; }</style><link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;700" rel="stylesheet"></head><body><h1>Hello</h1></body></html>',
    htmlSource:
      '<html><head><style>:root { --color-bg: #000; --font-display: "Rajdhani", sans-serif; }</style><link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;700" rel="stylesheet"></head><body><h1>Hello</h1></body></html>',
    modelId: 'claude-sonnet-4-5',
    inputTokens: 1000,
    outputTokens: 2000,
    cacheReadTokens: 0,
    cost: 0.05,
    generatedAt: '2026-06-01T10:00:00.000Z',
    iterationRound: 0,
    ...overrides,
  };
}

function makeStoredContract(overrides?: Partial<StoredContract>): StoredContract {
  return {
    tokens: {
      colors: [{ name: '--color-bg', value: '#000' }],
      fonts: [{ family: 'Rajdhani', weights: [400, 700], role: 'display' }],
      typeScale: [],
      spacing: [],
      other: [{ name: '--font-display', value: '"Rajdhani", sans-serif' }],
      meta: {
        extractedFrom: 'art-abc',
        recipeSummary: 'A cyberpunk landing page',
        fallback: false,
      },
    },
    contractMd: '# Design Contract — Test\n\n## Identity\nCyberpunk.',
    tokensJson: '{"color":{"bg":{"value":"#000"}}}',
    tokensCss: ':root {\n  --color-bg: #000;\n}',
    modelId: 'claude-haiku-4-5',
    cost: 0.001,
    createdAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeContractStoreMock(
  getImpl: (id: string) => Promise<StoredContract | null>,
  putImpl?: (id: string, c: StoredContract) => Promise<void>,
): ContractStore {
  return {
    get: vi.fn(getImpl),
    put: vi.fn(putImpl ?? (() => Promise.resolve())),
  };
}

function makeArchiveStoreMock(readImpl: (id: string) => Promise<ArchiveRecord | null>): {
  read: ReturnType<typeof vi.fn>;
} {
  return { read: vi.fn(readImpl) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('deriveContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // generateNarrative is a billable LLM call that tests override with ...Once()
    // variants — use mockReset() so any unconsumed one-shot queues from a prior
    // test can't leak into the next one, then re-establish a safe default.
    mockGenerateNarrative.mockReset().mockResolvedValue({
      narrative: {
        identity: 'Cyberpunk aesthetic.',
        rules: 'Use dark backgrounds.',
        componentPatterns: 'Neon borders on cards.',
        howToExtend: 'Follow the token system.',
      },
      modelId: 'claude-haiku-4-5',
      cost: 0.001,
    });
  });

  // ── Cache HIT ────────────────────────────────────────────────────────────

  describe('cache hit', () => {
    it('returns cached contract without calling generateNarrative or archive.read', async () => {
      const cached = makeStoredContract();
      const contractStore = makeContractStoreMock(() => Promise.resolve(cached));
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(null));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      const result = await deriveContract('art-cached', 'My Site');

      // CRITICAL: generateNarrative must NOT be called on a cache hit
      expect(mockGenerateNarrative).not.toHaveBeenCalled();
      // Archive read must NOT be called either
      expect(archiveStore.read).not.toHaveBeenCalled();
      // Returns the cached contract as-is
      expect(result).toEqual(cached);
    });

    it('does not call put on a cache hit', async () => {
      const cached = makeStoredContract();
      const contractStore = makeContractStoreMock(() => Promise.resolve(cached));
      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(makeArchiveStoreMock(() => Promise.resolve(null)));

      await deriveContract('art-cached', 'My Site');

      expect(contractStore.put).not.toHaveBeenCalled();
    });
  });

  // ── Cache MISS ───────────────────────────────────────────────────────────

  describe('cache miss — full pipeline', () => {
    it('reads the archive, runs the pipeline, calls put, and returns the StoredContract', async () => {
      const record = makeArchiveRecord();
      const contractStore = makeContractStoreMock(
        () => Promise.resolve(null), // cache miss
      );
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(record));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      const result = await deriveContract('art-miss', 'My Site');

      // Pipeline ran
      expect(archiveStore.read).toHaveBeenCalledWith('art-miss');
      expect(mockGenerateNarrative).toHaveBeenCalledOnce();
      // Result was cached
      expect(contractStore.put).toHaveBeenCalledOnce();
      const [putId, putContract] = (contractStore.put as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, StoredContract];
      expect(putId).toBe('art-miss');
      expect(putContract).toBe(result);
      // Result has expected shape
      expect(result.contractMd).toBeTruthy();
      expect(result.tokensCss).toBeTruthy();
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('prefers htmlSource over html for extraction and narrative', async () => {
      const record = makeArchiveRecord({
        html: '<html><body>INJECTED IMAGE VERSION</body></html>',
        htmlSource:
          '<html><head><style>:root { --color-bg: #0a0a0a; }</style></head><body>SOURCE</body></html>',
      });
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(record));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      await deriveContract('art-source', 'My Site');

      // generateNarrative must be called with htmlSource, not html
      const narrativeCall = mockGenerateNarrative.mock.calls[0] as [DesignTokens, string, string];
      expect(narrativeCall[1]).toBe(record.htmlSource);
      expect(narrativeCall[1]).not.toContain('INJECTED IMAGE VERSION');
    });

    it('falls back to html when htmlSource is absent', async () => {
      const record = makeArchiveRecord({ htmlSource: undefined });
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(record));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      await deriveContract('art-nosource', 'My Site');

      const narrativeCall = mockGenerateNarrative.mock.calls[0] as [DesignTokens, string, string];
      expect(narrativeCall[1]).toBe(record.html);
    });
  });

  // ── Missing artifact ─────────────────────────────────────────────────────

  describe('missing artifact', () => {
    it('throws ARTIFACT_NOT_FOUND when archive.read returns null', async () => {
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(null));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      await expect(deriveContract('art-gone', 'My Site')).rejects.toThrow(
        'ARTIFACT_NOT_FOUND: art-gone',
      );
    });
  });

  // ── Fallback (empty extraction) ───────────────────────────────────────────

  describe('empty extraction sets meta.fallback = true', () => {
    it('sets tokens.meta.fallback when no colors and no fonts are extracted', async () => {
      // Use HTML with no :root and no Google Fonts → extractTokens yields empty arrays
      const record = makeArchiveRecord({
        html: '<html><body><h1>Plain</h1></body></html>',
        htmlSource: '<html><body><h1>Plain</h1></body></html>',
      });
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(record));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      const result = await deriveContract('art-plain', 'Plain Site');

      expect(result.tokens.meta.fallback).toBe(true);
    });

    it('does NOT set fallback when colors are present (even with no fonts)', async () => {
      const record = makeArchiveRecord({
        htmlSource:
          '<html><head><style>:root { --color-bg: #ffffff; }</style></head><body></body></html>',
      });
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(record));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      const result = await deriveContract('art-colors', 'Color Site');

      expect(result.tokens.meta.fallback).toBe(false);
    });
  });

  // ── Narrative failure resilience ──────────────────────────────────────────

  describe('narrative failure resilience', () => {
    it('still produces a usable StoredContract when generateNarrative returns empty narrative', async () => {
      mockGenerateNarrative.mockResolvedValue({
        narrative: { identity: '', rules: '', componentPatterns: '', howToExtend: '' },
        modelId: 'claude-haiku-4-5',
        cost: 0,
      });

      const record = makeArchiveRecord();
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(record));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      const result = await deriveContract('art-nonarr', 'My Site');

      // contractMd must be non-empty (assemble uses placeholder text for empty narrative)
      expect(result.contractMd).toBeTruthy();
      expect(result.contractMd.length).toBeGreaterThan(50);
      expect(result.cost).toBe(0);
      // tokensCss is still rendered from tokens
      expect(result.tokensCss).toBeTruthy();
    });
  });

  // ── Concurrent in-flight dedup ───────────────────────────────────────────

  describe('concurrent in-flight dedup', () => {
    it('calls generateNarrative exactly once when two concurrent calls race on the same artifactId', async () => {
      const record = makeArchiveRecord();

      // Narrative mock resolves on next tick so both callers are guaranteed
      // in-flight simultaneously before either completes.
      let resolveNarrative!: (v: unknown) => void;
      const narrativePromise = new Promise((res) => {
        resolveNarrative = res;
      });
      mockGenerateNarrative.mockReturnValue(narrativePromise);

      const contractStore = makeContractStoreMock(
        () => Promise.resolve(null), // always a cache miss
      );
      const archiveStore = makeArchiveStoreMock(() => Promise.resolve(record));

      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(archiveStore);

      // Launch both calls without awaiting the first — they are genuinely concurrent
      const p1 = deriveContract('art-concurrent', 'My Site');
      const p2 = deriveContract('art-concurrent', 'My Site');

      // Unblock the narrative
      resolveNarrative({
        narrative: {
          identity: 'Cyberpunk aesthetic.',
          rules: 'Use dark backgrounds.',
          componentPatterns: 'Neon borders on cards.',
          howToExtend: 'Follow the token system.',
        },
        modelId: 'claude-haiku-4-5',
        cost: 0.001,
      });

      const [result1, result2] = await Promise.all([p1, p2]);

      // CRITICAL: only one billable call regardless of how many concurrent callers
      expect(mockGenerateNarrative).toHaveBeenCalledTimes(1);
      // Both callers get equal results
      expect(result1).toEqual(result2);
    });
  });

  // ── StoredContract shape ──────────────────────────────────────────────────

  describe('StoredContract shape', () => {
    it('result includes a valid ISO 8601 createdAt timestamp', async () => {
      const record = makeArchiveRecord();
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(makeArchiveStoreMock(() => Promise.resolve(record)));

      const result = await deriveContract('art-shape', 'Shape Site');

      // ISO 8601 date string
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(result.createdAt).getTime()).not.toBeNaN();
    });

    it('carries the modelId and cost from generateNarrative', async () => {
      mockGenerateNarrative.mockResolvedValue({
        narrative: { identity: 'X', rules: '', componentPatterns: '', howToExtend: '' },
        modelId: 'claude-haiku-4-5',
        cost: 0.00777,
      });

      const record = makeArchiveRecord();
      const contractStore = makeContractStoreMock(() => Promise.resolve(null));
      mockDefaultContractStore.mockReturnValue(contractStore);
      mockDefaultArchiveStore.mockReturnValue(makeArchiveStoreMock(() => Promise.resolve(record)));

      const result = await deriveContract('art-cost', 'Cost Site');

      expect(result.modelId).toBe('claude-haiku-4-5');
      expect(result.cost).toBe(0.00777);
    });
  });
});
