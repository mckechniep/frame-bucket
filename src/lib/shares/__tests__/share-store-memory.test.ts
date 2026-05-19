import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryShareStore } from '../share-store-memory';

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
