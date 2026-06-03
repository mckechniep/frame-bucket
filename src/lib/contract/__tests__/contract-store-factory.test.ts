import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defaultContractStore, _resetContractStoreCacheForTests } from '../contract-store-factory';
import { FsContractStore } from '../contract-store-fs';
import { SupabaseContractStore } from '../contract-store-supabase';

// Prevent SupabaseContractStore from trying to init real Supabase client.
vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(() => ({})),
}));

beforeEach(() => {
  _resetContractStoreCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetContractStoreCacheForTests();
});

describe('defaultContractStore (contract-store-factory)', () => {
  it('returns FsContractStore when FB_ARCHIVE_BACKEND is unset', () => {
    const original = process.env.FB_ARCHIVE_BACKEND;
    delete process.env.FB_ARCHIVE_BACKEND;
    try {
      const store = defaultContractStore();
      expect(store).toBeInstanceOf(FsContractStore);
    } finally {
      if (original !== undefined) process.env.FB_ARCHIVE_BACKEND = original;
    }
  });

  it('returns FsContractStore when FB_ARCHIVE_BACKEND="fs"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const store = defaultContractStore();
    expect(store).toBeInstanceOf(FsContractStore);
  });

  it('returns SupabaseContractStore when FB_ARCHIVE_BACKEND="supabase"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const store = defaultContractStore();
    expect(store).toBeInstanceOf(SupabaseContractStore);
  });

  it('caches the instance across calls (returns the same object reference)', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultContractStore();
    const b = defaultContractStore();
    expect(a).toBe(b);
  });

  it('_resetContractStoreCacheForTests() clears the cache so a new instance is returned', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultContractStore();
    _resetContractStoreCacheForTests();
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const b = defaultContractStore();
    expect(a).not.toBe(b);
    expect(b).toBeInstanceOf(SupabaseContractStore);
  });

  it('defaults to FsContractStore for an unrecognized backend value', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'mongo-or-something');
    const store = defaultContractStore();
    expect(store).toBeInstanceOf(FsContractStore);
  });
});
