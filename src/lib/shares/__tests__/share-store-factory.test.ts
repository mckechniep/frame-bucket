import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defaultShareStore, _resetShareStoreCacheForTests } from '../share-store-factory';
import { MemoryShareStore } from '../share-store-memory';
import { SupabaseShareStore } from '../share-store-supabase';

// Avoid hitting real Supabase if SupabaseShareStore tries to lazy-init anything.
vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(() => ({})),
}));

beforeEach(() => {
  _resetShareStoreCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('defaultShareStore (share-store-factory)', () => {
  it('returns MemoryShareStore when FB_ARCHIVE_BACKEND is unset', () => {
    const original = process.env.FB_ARCHIVE_BACKEND;
    delete process.env.FB_ARCHIVE_BACKEND;
    try {
      const store = defaultShareStore();
      expect(store).toBeInstanceOf(MemoryShareStore);
    } finally {
      if (original !== undefined) process.env.FB_ARCHIVE_BACKEND = original;
    }
  });

  it('returns MemoryShareStore when FB_ARCHIVE_BACKEND="fs"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const store = defaultShareStore();
    expect(store).toBeInstanceOf(MemoryShareStore);
  });

  it('returns SupabaseShareStore when FB_ARCHIVE_BACKEND="supabase"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const store = defaultShareStore();
    expect(store).toBeInstanceOf(SupabaseShareStore);
  });

  it('caches the instance across calls', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultShareStore();
    const b = defaultShareStore();
    expect(a).toBe(b);
  });

  it('_resetShareStoreCacheForTests() clears the cache', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultShareStore();
    _resetShareStoreCacheForTests();
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const b = defaultShareStore();
    expect(a).not.toBe(b);
    expect(b).toBeInstanceOf(SupabaseShareStore);
  });

  it('defaults to MemoryShareStore for an unrecognized backend value', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'redis-or-something-wrong');
    const store = defaultShareStore();
    expect(store).toBeInstanceOf(MemoryShareStore);
  });
});
