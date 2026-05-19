import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackView, _internals } from '../view-tracking';
import type { ShareStore } from '../share-store';

function makeMockStore(impl: Partial<ShareStore> = {}): ShareStore {
  return {
    create: vi.fn(),
    findByToken: vi.fn(),
    list: vi.fn(),
    rename: vi.fn(),
    revoke: vi.fn(),
    trackViewIfNotRecent: vi.fn().mockResolvedValue(true),
    ...impl,
  } as ShareStore;
}

function makeHeaders(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('trackView', () => {
  it('returns immediately (does not block on the inner async work)', async () => {
    let resolved = false;
    const store = makeMockStore({
      trackViewIfNotRecent: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 50));
        resolved = true;
        return true;
      }),
    });

    const start = Date.now();
    await trackView(store, 'abcdefghijklmnop', makeHeaders({ 'user-agent': 'Mozilla/5.0' }));
    const elapsed = Date.now() - start;

    // Should return well under the 50ms inner work
    expect(elapsed).toBeLessThan(20);
    // Inner work hasn't completed yet
    expect(resolved).toBe(false);
  });

  it('skips tracking for Slackbot UA', async () => {
    const trackSpy = vi.fn().mockResolvedValue(true);
    const store = makeMockStore({ trackViewIfNotRecent: trackSpy });
    await trackView(store, 'abc', makeHeaders({ 'user-agent': 'Slackbot 1.0' }));
    // Wait a tick to let the unawaited inner work complete
    await new Promise((r) => setImmediate(r));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('skips tracking for Twitterbot UA', async () => {
    const trackSpy = vi.fn().mockResolvedValue(true);
    const store = makeMockStore({ trackViewIfNotRecent: trackSpy });
    await trackView(store, 'abc', makeHeaders({ 'user-agent': 'Twitterbot/1.0' }));
    await new Promise((r) => setImmediate(r));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('skips tracking for facebookexternalhit (link unfurler)', async () => {
    const trackSpy = vi.fn().mockResolvedValue(true);
    const store = makeMockStore({ trackViewIfNotRecent: trackSpy });
    await trackView(store, 'abc', makeHeaders({ 'user-agent': 'facebookexternalhit/1.1' }));
    await new Promise((r) => setImmediate(r));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('skips tracking when Purpose: prefetch is set (Chrome)', async () => {
    const trackSpy = vi.fn().mockResolvedValue(true);
    const store = makeMockStore({ trackViewIfNotRecent: trackSpy });
    await trackView(
      store,
      'abc',
      makeHeaders({
        'user-agent': 'Mozilla/5.0',
        purpose: 'prefetch',
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('skips tracking when Sec-Fetch-Purpose: prefetch is set (Firefox)', async () => {
    const trackSpy = vi.fn().mockResolvedValue(true);
    const store = makeMockStore({ trackViewIfNotRecent: trackSpy });
    await trackView(
      store,
      'abc',
      makeHeaders({
        'user-agent': 'Mozilla/5.0',
        'sec-fetch-purpose': 'prefetch',
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('calls trackViewIfNotRecent for a normal UA without prefetch headers', async () => {
    const trackSpy = vi.fn().mockResolvedValue(true);
    const store = makeMockStore({ trackViewIfNotRecent: trackSpy });
    await trackView(store, 'abc', makeHeaders({ 'user-agent': 'Mozilla/5.0 (real browser)' }));
    await new Promise((r) => setImmediate(r));
    expect(trackSpy).toHaveBeenCalledWith('abc', _internals.VIEW_WINDOW_MS);
  });

  it('swallows errors from the store (Rule 5: never propagates)', async () => {
    const store = makeMockStore({
      trackViewIfNotRecent: vi.fn().mockRejectedValue(new Error('db down')),
    });
    // Should NOT throw
    await expect(
      trackView(store, 'abc', makeHeaders({ 'user-agent': 'Mozilla/5.0' })),
    ).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    // Confirms the error was logged, not thrown
    expect(console.error).toHaveBeenCalledWith(
      '[view-tracking] failed',
      expect.objectContaining({ token: 'abc' }),
    );
  });

  it('uses a 5-minute window constant', () => {
    expect(_internals.VIEW_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});
