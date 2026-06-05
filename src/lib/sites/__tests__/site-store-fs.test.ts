import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FsSiteStore } from '../site-store-fs';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fb-sites-test-'));
}

describe('FsSiteStore', () => {
  describe('createSite', () => {
    it('returns a record with a site- prefixed hex id and ISO timestamps', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'My Site' });
      expect(site.id).toMatch(/^site-[0-9a-f]{12}$/);
      expect(site.name).toBe('My Site');
      expect(site.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(site.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('two creates produce distinct ids', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const a = await store.createSite({ name: 'A' });
      const b = await store.createSite({ name: 'B' });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('getSite', () => {
    it('returns the created site by id', async () => {
      const dir = makeTmpDir();
      const store = new FsSiteStore(dir);
      const created = await store.createSite({ name: 'Test' });
      const found = await store.getSite(created.id);
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Test');
    });

    it('returns null for an unknown id', async () => {
      const store = new FsSiteStore(makeTmpDir());
      expect(await store.getSite('site-000000000000')).toBeNull();
    });
  });

  describe('addPage + listPages', () => {
    it('returns pages ordered by position asc even when inserted out of order', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'S' });
      await store.addPage(site.id, {
        slug: '/about',
        title: 'About',
        artifactId: 'a2',
        position: 2,
      });
      await store.addPage(site.id, { slug: '/', title: 'Home', artifactId: 'a1', position: 1 });
      await store.addPage(site.id, {
        slug: '/contact',
        title: 'Contact',
        artifactId: 'a3',
        position: 3,
      });
      const pages = await store.listPages(site.id);
      expect(pages.map((p) => p.slug)).toEqual(['/', '/about', '/contact']);
    });

    it('returned page record has correct fields', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'S' });
      const page = await store.addPage(site.id, {
        slug: '/',
        title: 'Home',
        artifactId: 'art-1',
        position: 1,
      });
      expect(page.siteId).toBe(site.id);
      expect(page.slug).toBe('/');
      expect(page.title).toBe('Home');
      expect(page.artifactId).toBe('art-1');
      expect(page.position).toBe(1);
      expect(page.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('listPages returns empty array for site with no pages', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'Empty' });
      expect(await store.listPages(site.id)).toEqual([]);
    });

    it('listPages returns empty array for an unknown siteId', async () => {
      const store = new FsSiteStore(makeTmpDir());
      expect(await store.listPages('site-000000000000')).toEqual([]);
    });
  });

  describe('addPage error cases', () => {
    it('throws SLUG_EXISTS when adding a duplicate slug', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'S' });
      await store.addPage(site.id, { slug: '/', title: 'Home', artifactId: 'a1', position: 1 });
      await expect(
        store.addPage(site.id, { slug: '/', title: 'Home 2', artifactId: 'a2', position: 2 }),
      ).rejects.toThrow('SLUG_EXISTS');
    });

    it('throws SITE_NOT_FOUND when adding to an unknown site', async () => {
      const store = new FsSiteStore(makeTmpDir());
      await expect(
        store.addPage('site-000000000000', {
          slug: '/',
          title: 'Home',
          artifactId: 'a1',
          position: 1,
        }),
      ).rejects.toThrow('SITE_NOT_FOUND');
    });
  });

  describe('removePage', () => {
    it('returns true and removes the page', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'S' });
      await store.addPage(site.id, { slug: '/', title: 'Home', artifactId: 'a1', position: 1 });
      const result = await store.removePage(site.id, '/');
      expect(result).toBe(true);
      const pages = await store.listPages(site.id);
      expect(pages).toHaveLength(0);
    });

    it('returns false for an unknown slug', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'S' });
      expect(await store.removePage(site.id, '/nope')).toBe(false);
    });

    it('returns false for an unknown site', async () => {
      const store = new FsSiteStore(makeTmpDir());
      expect(await store.removePage('site-000000000000', '/')).toBe(false);
    });
  });

  describe('setPageArtifact', () => {
    it('updates the artifactId and returns the updated page', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'S' });
      await store.addPage(site.id, {
        slug: '/',
        title: 'Home',
        artifactId: 'art-old',
        position: 1,
      });
      const updated = await store.setPageArtifact(site.id, '/', 'art-new');
      expect(updated?.artifactId).toBe('art-new');
      const pages = await store.listPages(site.id);
      expect(pages[0]?.artifactId).toBe('art-new');
    });

    it('returns null for an unknown site', async () => {
      const store = new FsSiteStore(makeTmpDir());
      expect(await store.setPageArtifact('site-000000000000', '/', 'art-1')).toBeNull();
    });

    it('returns null for an unknown slug', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'S' });
      expect(await store.setPageArtifact(site.id, '/nope', 'art-1')).toBeNull();
    });
  });

  describe('immutability', () => {
    it('mutating a returned SiteRecord does not affect subsequent reads', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const site = await store.createSite({ name: 'Original' });
      site.name = 'Mutated';
      const refetch = await store.getSite(site.id);
      expect(refetch?.name).toBe('Original');
    });

    it('mutating a returned SitePage does not affect subsequent reads', async () => {
      const store = new FsSiteStore(makeTmpDir());
      const s = await store.createSite({ name: 'S' });
      const page = await store.addPage(s.id, {
        slug: '/',
        title: 'Home',
        artifactId: 'art-1',
        position: 1,
      });
      page.artifactId = 'mutated';
      const pages = await store.listPages(s.id);
      expect(pages[0]?.artifactId).toBe('art-1');
    });
  });

  describe('persistence (FsSiteStore specific)', () => {
    it('state survives constructing a second store instance pointed at the same base dir', async () => {
      const dir = makeTmpDir();
      const store1 = new FsSiteStore(dir);
      const site = await store1.createSite({ name: 'Persistent Site' });
      await store1.addPage(site.id, {
        slug: '/',
        title: 'Home',
        artifactId: 'art-1',
        position: 1,
      });
      await store1.addPage(site.id, {
        slug: '/about',
        title: 'About',
        artifactId: 'art-2',
        position: 2,
      });

      // Second instance, same dir
      const store2 = new FsSiteStore(dir);
      const refetchedSite = await store2.getSite(site.id);
      expect(refetchedSite?.name).toBe('Persistent Site');
      const pages = await store2.listPages(site.id);
      expect(pages).toHaveLength(2);
      expect(pages.map((p) => p.slug)).toEqual(['/', '/about']);
    });

    it('operations on second store instance persist correctly', async () => {
      const dir = makeTmpDir();
      const store1 = new FsSiteStore(dir);
      const site = await store1.createSite({ name: 'S' });
      await store1.addPage(site.id, { slug: '/', title: 'Home', artifactId: 'art-1', position: 1 });

      const store2 = new FsSiteStore(dir);
      await store2.setPageArtifact(site.id, '/', 'art-updated');

      const store3 = new FsSiteStore(dir);
      const pages = await store3.listPages(site.id);
      expect(pages[0]?.artifactId).toBe('art-updated');
    });
  });
});
