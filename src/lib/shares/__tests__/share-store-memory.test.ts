import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SharePageSnapshot } from '../share-store';
import { MemoryShareStore } from '../share-store-memory';

/** Minimal page snapshot factory for test helpers. */
function makePage(overrides?: Partial<SharePageSnapshot>): SharePageSnapshot {
  return {
    slug: '/',
    title: 'Home',
    artifactId: 'art-001',
    position: 0,
    ...overrides,
  };
}

describe('MemoryShareStore', () => {
  describe('create', () => {
    it('returns a record with a valid token, default state, and createdAt', async () => {
      const store = new MemoryShareStore();
      const r = await store.create({ artifactId: 'a1', name: 'first share' });
      expect(r.token).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(r.artifactId).toBe('a1');
      expect(r.name).toBe('first share');
      expect(r.revokedAt).toBeNull();
      expect(r.lastViewedAt).toBeNull();
      expect(r.viewCount).toBe(0);
      expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('two creates produce two distinct tokens', async () => {
      const store = new MemoryShareStore();
      const a = await store.create({ artifactId: 'a1', name: 'a' });
      const b = await store.create({ artifactId: 'a1', name: 'b' });
      expect(a.token).not.toBe(b.token);
    });

    // ── site-scoped path ──────────────────────────────────────────────────

    it('site-scoped create stores siteId, pages, and initial state', async () => {
      const store = new MemoryShareStore();
      const pages: SharePageSnapshot[] = [
        makePage({ slug: '/', title: 'Home', position: 0 }),
        makePage({ slug: '/about', title: 'About', artifactId: 'art-002', position: 1 }),
      ];
      const r = await store.create({ siteId: 'site-abc', name: 'My Site Share', pages });
      expect(r.token).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(r.siteId).toBe('site-abc');
      expect(r.name).toBe('My Site Share');
      expect(r.pages).toHaveLength(2);
      expect(r.pages[0]).toEqual({ slug: '/', title: 'Home', artifactId: 'art-001', position: 0 });
      expect(r.pages[1]).toEqual({
        slug: '/about',
        title: 'About',
        artifactId: 'art-002',
        position: 1,
      });
      expect(r.revokedAt).toBeNull();
      expect(r.viewCount).toBe(0);
      expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('snapshot immutability — mutating the input pages after create does not change the stored snapshot', async () => {
      const store = new MemoryShareStore();
      const pages: SharePageSnapshot[] = [makePage()];
      const r = await store.create({ siteId: 'site-abc', name: 'snap', pages });

      // Push an extra page to the ORIGINAL array — stored snapshot must be unchanged
      pages.push(makePage({ slug: '/new', title: 'New Page', position: 1 }));

      const fetched = await store.findByToken(r.token);
      expect(fetched?.pages).toHaveLength(1);
    });

    it('snapshot immutability — mutating a returned record pages does not change the next findByToken result', async () => {
      const store = new MemoryShareStore();
      const pages: SharePageSnapshot[] = [makePage()];
      const r = await store.create({ siteId: 'site-abc', name: 'snap', pages });

      // Mutate the returned record's pages array
      r.pages.push(makePage({ slug: '/evil', title: 'Evil', position: 99 }));

      const fetched = await store.findByToken(r.token);
      expect(fetched?.pages).toHaveLength(1);
    });

    it('snapshot immutability — mutating a field on a returned page does not affect the next findByToken', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({
        siteId: 'site-abc',
        name: 'snap',
        pages: [makePage({ slug: '/', title: 'Home', position: 0 })],
      });

      // Mutate a field on the returned page
      created.pages[0]!.title = 'MUTATED';

      const fetched = await store.findByToken(created.token);
      expect(fetched?.pages[0]?.title).toBe('Home');
    });

    it('snapshot immutability — mutating a field on a page from list() does not affect the next list()', async () => {
      const store = new MemoryShareStore();
      await store.create({
        siteId: 'site-abc',
        name: 'snap',
        pages: [makePage({ slug: '/', title: 'Home', position: 0 })],
      });

      const first = await store.list();
      first[0]!.pages[0]!.title = 'MUTATED';

      const second = await store.list();
      expect(second[0]?.pages[0]?.title).toBe('Home');
    });

    it('snapshot immutability — mutating an input page field after create does not affect the stored snapshot', async () => {
      const store = new MemoryShareStore();
      const input: SharePageSnapshot[] = [makePage({ slug: '/', title: 'Home', position: 0 })];
      const created = await store.create({
        siteId: 'site-abc',
        name: 'snap',
        pages: input,
      });

      // Mutate the original input's page field
      input[0]!.title = 'MUTATED';

      const fetched = await store.findByToken(created.token);
      expect(fetched?.pages[0]?.title).toBe('Home');
    });

    it('legacy create (transitional) — { artifactId, name } still works; siteId is empty string, pages empty', async () => {
      const store = new MemoryShareStore();
      const r = await store.create({ artifactId: 'art-legacy', name: 'legacy share' });
      expect(r.artifactId).toBe('art-legacy');
      expect(r.siteId).toBe('');
      expect(r.pages).toEqual([]);
      expect(r.token).toMatch(/^[A-Za-z0-9]{16}$/);
    });
  });

  describe('findByToken', () => {
    it('returns null for missing tokens', async () => {
      const store = new MemoryShareStore();
      expect(await store.findByToken('nope')).toBeNull();
    });

    it('returns the record for an existing token', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'n' });
      const found = await store.findByToken(created.token);
      expect(found?.token).toBe(created.token);
    });

    it('returns pages on site-scoped records', async () => {
      const store = new MemoryShareStore();
      const pages = [makePage({ slug: '/', title: 'Home', position: 0 })];
      const created = await store.create({ siteId: 'site-xyz', name: 'with pages', pages });
      const found = await store.findByToken(created.token);
      expect(found?.pages).toHaveLength(1);
      expect(found?.pages[0]?.slug).toBe('/');
      expect(found?.siteId).toBe('site-xyz');
    });
  });

  describe('list', () => {
    it('returns empty list when no shares exist', async () => {
      const store = new MemoryShareStore();
      expect(await store.list()).toEqual([]);
    });

    it('orders shares newest first by createdAt', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const store = new MemoryShareStore();
      const first = await store.create({ artifactId: 'a1', name: 'first' });
      vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
      const second = await store.create({ artifactId: 'a2', name: 'second' });
      const all = await store.list();
      expect(all.length).toBe(2);
      expect(all[0]!.token).toBe(second.token);
      expect(all[1]!.token).toBe(first.token);
      vi.useRealTimers();
    });

    it('pages survive list — site-scoped records carry their snapshots', async () => {
      const store = new MemoryShareStore();
      const pages = [
        makePage({ slug: '/', title: 'Home', position: 0 }),
        makePage({ slug: '/contact', title: 'Contact', artifactId: 'art-003', position: 1 }),
      ];
      await store.create({ siteId: 'site-xyz', name: 'listed share', pages });
      const all = await store.list();
      expect(all).toHaveLength(1);
      expect(all[0]!.pages).toHaveLength(2);
      expect(all[0]!.pages[0]?.slug).toBe('/');
      expect(all[0]!.pages[1]?.slug).toBe('/contact');
      expect(all[0]!.siteId).toBe('site-xyz');
    });
  });

  describe('rename', () => {
    it('updates the name and returns the updated record', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'old' });
      const updated = await store.rename(created.token, 'new');
      expect(updated?.name).toBe('new');
      const refetch = await store.findByToken(created.token);
      expect(refetch?.name).toBe('new');
    });

    it('returns null for missing token', async () => {
      const store = new MemoryShareStore();
      expect(await store.rename('nope', 'new')).toBeNull();
    });
  });

  describe('revoke', () => {
    it('sets revokedAt and returns the record', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'n' });
      const revoked = await store.revoke(created.token);
      expect(revoked?.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('is idempotent — second revoke keeps the original timestamp', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'n' });
      const first = await store.revoke(created.token);
      vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
      const second = await store.revoke(created.token);
      expect(second?.revokedAt).toBe(first?.revokedAt);
      vi.useRealTimers();
    });

    it('returns null for missing token', async () => {
      const store = new MemoryShareStore();
      expect(await store.revoke('nope')).toBeNull();
    });
  });

  describe('trackViewIfNotRecent', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('records the first view and bumps view_count to 1', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'n' });
      const recorded = await store.trackViewIfNotRecent(created.token, 5 * 60 * 1000);
      expect(recorded).toBe(true);
      const refetch = await store.findByToken(created.token);
      expect(refetch?.viewCount).toBe(1);
      expect(refetch?.lastViewedAt).not.toBeNull();
    });

    it('returns false on a repeat call within the same window', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'n' });
      await store.trackViewIfNotRecent(created.token, 5 * 60 * 1000);
      const second = await store.trackViewIfNotRecent(created.token, 5 * 60 * 1000);
      expect(second).toBe(false);
      const refetch = await store.findByToken(created.token);
      expect(refetch?.viewCount).toBe(1);
    });

    it('records a view in the next window after the throttle expires', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'n' });
      await store.trackViewIfNotRecent(created.token, 5 * 60 * 1000);
      // Advance past the bucket boundary
      vi.setSystemTime(new Date(Date.now() + 6 * 60 * 1000));
      const second = await store.trackViewIfNotRecent(created.token, 5 * 60 * 1000);
      expect(second).toBe(true);
      const refetch = await store.findByToken(created.token);
      expect(refetch?.viewCount).toBe(2);
    });

    it('returns false for a revoked share', async () => {
      const store = new MemoryShareStore();
      const created = await store.create({ artifactId: 'a1', name: 'n' });
      await store.revoke(created.token);
      const recorded = await store.trackViewIfNotRecent(created.token, 5 * 60 * 1000);
      expect(recorded).toBe(false);
    });

    it('returns false for a missing token', async () => {
      const store = new MemoryShareStore();
      const recorded = await store.trackViewIfNotRecent('nope', 5 * 60 * 1000);
      expect(recorded).toBe(false);
    });
  });
});
