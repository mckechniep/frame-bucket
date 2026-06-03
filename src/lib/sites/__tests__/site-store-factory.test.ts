import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defaultSiteStore, _resetSiteStoreCacheForTests } from '../site-store-factory';
import { FsSiteStore } from '../site-store-fs';
import { SupabaseSiteStore } from '../site-store-supabase';

// Avoid hitting real Supabase if SupabaseSiteStore tries to lazy-init anything.
vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(() => ({})),
}));

beforeEach(() => {
  _resetSiteStoreCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('defaultSiteStore (site-store-factory)', () => {
  it('returns FsSiteStore when FB_ARCHIVE_BACKEND is unset', () => {
    const original = process.env.FB_ARCHIVE_BACKEND;
    delete process.env.FB_ARCHIVE_BACKEND;
    try {
      const store = defaultSiteStore();
      expect(store).toBeInstanceOf(FsSiteStore);
    } finally {
      if (original !== undefined) process.env.FB_ARCHIVE_BACKEND = original;
    }
  });

  it('returns FsSiteStore when FB_ARCHIVE_BACKEND="fs"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const store = defaultSiteStore();
    expect(store).toBeInstanceOf(FsSiteStore);
  });

  it('returns SupabaseSiteStore when FB_ARCHIVE_BACKEND="supabase"', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const store = defaultSiteStore();
    expect(store).toBeInstanceOf(SupabaseSiteStore);
  });

  it('caches the instance across calls', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultSiteStore();
    const b = defaultSiteStore();
    expect(a).toBe(b);
  });

  it('_resetSiteStoreCacheForTests() clears the cache', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'fs');
    const a = defaultSiteStore();
    _resetSiteStoreCacheForTests();
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const b = defaultSiteStore();
    expect(a).not.toBe(b);
    expect(b).toBeInstanceOf(SupabaseSiteStore);
  });

  it('defaults to FsSiteStore for an unrecognized backend value', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'redis-or-something-wrong');
    const store = defaultSiteStore();
    expect(store).toBeInstanceOf(FsSiteStore);
  });
});
