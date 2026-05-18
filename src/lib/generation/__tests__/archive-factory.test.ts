import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defaultArchiveStore, _resetArchiveStoreCacheForTests } from '../archive-factory';
import { FilesystemArchiveStore } from '../archive';
import { SupabaseArchiveStore } from '../archive-supabase';

// Avoid hitting real Supabase if SupabaseArchiveStore tries to lazy-init anything.
vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(() => ({})),
}));

beforeEach(() => {
  _resetArchiveStoreCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('defaultArchiveStore (archive-factory)', () => {
  it('returns FilesystemArchiveStore when FB_ARCHIVE_BACKEND is unset', () => {
    // Remove the env var if it exists
    const original = process.env.FB_ARCHIVE_BACKEND;
    delete process.env.FB_ARCHIVE_BACKEND;

    try {
      const store = defaultArchiveStore();
      expect(store).toBeInstanceOf(FilesystemArchiveStore);
    } finally {
      if (original !== undefined) {
        process.env.FB_ARCHIVE_BACKEND = original;
      }
    }
  });

  it('returns FilesystemArchiveStore when FB_ARCHIVE_BACKEND="fs"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const store = defaultArchiveStore();
    expect(store).toBeInstanceOf(FilesystemArchiveStore);
  });

  it('returns SupabaseArchiveStore when FB_ARCHIVE_BACKEND="supabase"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const store = defaultArchiveStore();
    expect(store).toBeInstanceOf(SupabaseArchiveStore);
  });

  it('caches the instance across calls', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultArchiveStore();
    const b = defaultArchiveStore();
    expect(a).toBe(b); // same reference
  });

  it('_resetArchiveStoreCacheForTests() clears the cache', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultArchiveStore();
    _resetArchiveStoreCacheForTests();
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const b = defaultArchiveStore();
    expect(a).not.toBe(b);
    expect(b).toBeInstanceOf(SupabaseArchiveStore);
  });

  it('defaults to FilesystemArchiveStore for an unrecognized backend value', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'redis-or-something-wrong');
    const store = defaultArchiveStore();
    expect(store).toBeInstanceOf(FilesystemArchiveStore);
  });
});
