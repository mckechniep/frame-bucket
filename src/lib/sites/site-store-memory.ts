import crypto from 'node:crypto';
import type { SiteRecord, SitePage, SiteStore } from './site-store';

interface SiteEntry {
  site: SiteRecord;
  pages: Map<string, SitePage>;
}

export class MemorySiteStore implements SiteStore {
  private entries = new Map<string, SiteEntry>();

  async createSite({ name }: { name: string }): Promise<SiteRecord> {
    const id = 'site-' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();
    const site: SiteRecord = { id, name, createdAt: now, updatedAt: now };
    this.entries.set(id, { site: { ...site }, pages: new Map() });
    return { ...site };
  }

  async getSite(id: string): Promise<SiteRecord | null> {
    const entry = this.entries.get(id);
    return entry ? { ...entry.site } : null;
  }

  async addPage(
    siteId: string,
    input: { slug: string; title: string; artifactId: string; position: number },
  ): Promise<SitePage> {
    const entry = this.entries.get(siteId);
    if (!entry) {
      throw new Error(`SITE_NOT_FOUND: no site with id ${siteId}`);
    }
    if (entry.pages.has(input.slug)) {
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
    entry.pages.set(input.slug, { ...page });
    return { ...page };
  }

  async removePage(siteId: string, slug: string): Promise<boolean> {
    const entry = this.entries.get(siteId);
    if (!entry) return false;
    return entry.pages.delete(slug);
  }

  async setPageArtifact(
    siteId: string,
    slug: string,
    artifactId: string,
  ): Promise<SitePage | null> {
    const entry = this.entries.get(siteId);
    if (!entry) return null;
    const page = entry.pages.get(slug);
    if (!page) return null;
    const updated: SitePage = { ...page, artifactId };
    entry.pages.set(slug, updated);
    return { ...updated };
  }

  async listPages(siteId: string): Promise<SitePage[]> {
    const entry = this.entries.get(siteId);
    if (!entry) return [];
    return [...entry.pages.values()].sort((a, b) => a.position - b.position).map((p) => ({ ...p }));
  }
}
