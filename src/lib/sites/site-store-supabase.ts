import crypto from 'node:crypto';
import type { SiteRecord, SitePage, SiteStore } from './site-store';
import { supabaseServer } from '@/lib/supabase/client-server';
import type { Database } from '@/lib/supabase/database.types';

type SiteRow = Database['public']['Tables']['sites']['Row'];
type SitePageRow = Database['public']['Tables']['site_pages']['Row'];

function rowToSiteRecord(row: SiteRow): SiteRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSitePage(row: SitePageRow): SitePage {
  return {
    siteId: row.site_id,
    slug: row.slug,
    title: row.title,
    artifactId: row.artifact_id,
    position: row.position,
    createdAt: row.created_at,
  };
}

export class SupabaseSiteStore implements SiteStore {
  async createSite({ name }: { name: string }): Promise<SiteRecord> {
    const sb = supabaseServer();
    const id = 'site-' + crypto.randomBytes(6).toString('hex');
    const { data, error } = await sb.from('sites').insert({ id, name }).select('*').single();
    if (error) throw new Error(`SupabaseSiteStore.createSite: ${error.message}`);
    return rowToSiteRecord(data);
  }

  async getSite(id: string): Promise<SiteRecord | null> {
    const sb = supabaseServer();
    const { data, error } = await sb.from('sites').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SupabaseSiteStore.getSite: ${error.message}`);
    return data ? rowToSiteRecord(data) : null;
  }

  async addPage(
    siteId: string,
    input: { slug: string; title: string; artifactId: string; position: number },
  ): Promise<SitePage> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('site_pages')
      .insert({
        site_id: siteId,
        slug: input.slug,
        title: input.title,
        artifact_id: input.artifactId,
        position: input.position,
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new Error(`SLUG_EXISTS: slug "${input.slug}" already exists in site ${siteId}`);
      }
      if (error.code === '23503') {
        throw new Error(`SITE_NOT_FOUND: no site with id ${siteId}`);
      }
      throw new Error(`SupabaseSiteStore.addPage: ${error.message}`);
    }
    return rowToSitePage(data);
  }

  async listPages(siteId: string): Promise<SitePage[]> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('site_pages')
      .select('*')
      .eq('site_id', siteId)
      .order('position', { ascending: true });
    if (error) throw new Error(`SupabaseSiteStore.listPages: ${error.message}`);
    return (data ?? []).map(rowToSitePage);
  }

  async setPageArtifact(
    siteId: string,
    slug: string,
    artifactId: string,
  ): Promise<SitePage | null> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('site_pages')
      .update({ artifact_id: artifactId })
      .eq('site_id', siteId)
      .eq('slug', slug)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseSiteStore.setPageArtifact: ${error.message}`);
    return data ? rowToSitePage(data) : null;
  }

  async removePage(siteId: string, slug: string): Promise<boolean> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('site_pages')
      .delete()
      .eq('site_id', siteId)
      .eq('slug', slug)
      .select('*');
    if (error) throw new Error(`SupabaseSiteStore.removePage: ${error.message}`);
    return Array.isArray(data) && data.length > 0;
  }
}
