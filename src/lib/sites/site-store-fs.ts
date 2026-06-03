import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SiteRecord, SitePage, SiteStore } from './site-store';

interface SiteFile {
  site: SiteRecord;
  pages: SitePage[];
}

/**
 * Filesystem-backed SiteStore.
 *
 * Each site is stored as a single JSON file: `<baseDir>/<siteId>.json`.
 * Writes are atomic (write-to-temp then rename) to prevent torn files on crash.
 *
 * NOT safe for concurrent writes to the same site (read-modify-write races).
 * Acceptable for single-operator local dev; use SupabaseSiteStore in production.
 */
export class FsSiteStore implements SiteStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    // Resolve cwd at construction time, not import time.
    this.baseDir = baseDir ?? path.join(process.cwd(), 'tmp', 'sites');
  }

  async createSite({ name }: { name: string }): Promise<SiteRecord> {
    const id = 'site-' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();
    const site: SiteRecord = { id, name, createdAt: now, updatedAt: now };
    const file: SiteFile = { site: { ...site }, pages: [] }; // store a copy, not a live reference
    await this.writeFile(id, file);
    return { ...site };
  }

  async getSite(id: string): Promise<SiteRecord | null> {
    const file = await this.readFile(id);
    return file ? { ...file.site } : null;
  }

  async addPage(
    siteId: string,
    input: { slug: string; title: string; artifactId: string; position: number },
  ): Promise<SitePage> {
    const file = await this.readFile(siteId);
    if (!file) {
      throw new Error(`SITE_NOT_FOUND: no site with id ${siteId}`);
    }
    if (file.pages.some((p) => p.slug === input.slug)) {
      throw new Error(`SLUG_EXISTS: slug "${input.slug}" already exists in site ${siteId}`);
    }
    const page: SitePage = {
      siteId,
      slug: input.slug,
      title: input.title,
      artifactId: input.artifactId,
      position: input.position,
      createdAt: new Date().toISOString(),
    };
    const updated: SiteFile = { ...file, pages: [...file.pages, page] };
    await this.writeFile(siteId, updated);
    return { ...page };
  }

  async removePage(siteId: string, slug: string): Promise<boolean> {
    const file = await this.readFile(siteId);
    if (!file) return false;
    const originalLength = file.pages.length;
    const remaining = file.pages.filter((p) => p.slug !== slug);
    if (remaining.length === originalLength) return false;
    await this.writeFile(siteId, { ...file, pages: remaining });
    return true;
  }

  async setPageArtifact(
    siteId: string,
    slug: string,
    artifactId: string,
  ): Promise<SitePage | null> {
    const file = await this.readFile(siteId);
    if (!file) return null;
    const idx = file.pages.findIndex((p) => p.slug === slug);
    if (idx === -1) return null;
    const existing = file.pages[idx];
    if (!existing) return null;
    const updated: SitePage = { ...existing, artifactId };
    const pages = file.pages.map((p, i) => (i === idx ? updated : p));
    await this.writeFile(siteId, { ...file, pages });
    return { ...updated };
  }

  async listPages(siteId: string): Promise<SitePage[]> {
    const file = await this.readFile(siteId);
    if (!file) return [];
    return [...file.pages].sort((a, b) => a.position - b.position).map((p) => ({ ...p }));
  }

  private filePath(siteId: string): string {
    return path.join(this.baseDir, `${siteId}.json`);
  }

  private async readFile(siteId: string): Promise<SiteFile | null> {
    try {
      const raw = await fs.readFile(this.filePath(siteId), 'utf-8');
      return JSON.parse(raw) as SiteFile; // No runtime shape validation — assumes files were written by this class.
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private async writeFile(siteId: string, data: SiteFile): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const target = this.filePath(siteId);
    const tmp = target + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    await fs.rename(tmp, target); // atomic on same filesystem — no torn/truncated files
  }
}
