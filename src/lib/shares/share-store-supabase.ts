import type { CreateShareInput, SharePageSnapshot, ShareRecord, ShareStore } from './share-store';
import { generateShareToken } from './token';
import { supabaseServer } from '@/lib/supabase/client-server';

type ShareRow = {
  token: string;
  site_id: string;
  name: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  created_at: string;
};

type SharePageRow = {
  token: string;
  slug: string;
  title: string;
  artifact_id: string;
  position: number;
};

export class SupabaseShareStore implements ShareStore {
  async create(input: CreateShareInput): Promise<ShareRecord> {
    const sb = supabaseServer();
    const token = generateShareToken();

    // Fail fast: site-scoped shares must have at least one page.
    if (input.pages.length === 0) {
      throw new Error('SupabaseShareStore.create: pages must not be empty for site-scoped shares');
    }

    // Insert the shares row.
    const { error: shareErr } = await sb
      .from('shares')
      .insert({ token, site_id: input.siteId, name: input.name });
    if (shareErr) throw new Error(`SupabaseShareStore.create (shares): ${shareErr.message}`);

    // Batch-insert all page snapshots.
    const pageRows = input.pages.map((p) => ({
      token,
      slug: p.slug,
      title: p.title,
      artifact_id: p.artifactId,
      position: p.position,
    }));

    const { error: pagesErr } = await sb.from('share_pages').insert(pageRows);
    if (pagesErr) {
      // Manual rollback: delete the shares row we just inserted so we don't
      // leave an orphan share with no pages. Supabase JS has no transactions.
      const { error: rollbackErr } = await sb.from('shares').delete().eq('token', token);
      if (rollbackErr) {
        console.error(
          `[SupabaseShareStore.create] rollback failed for token ${token}: ${rollbackErr.message}`,
        );
      }
      throw new Error(`SupabaseShareStore.create (share_pages): ${pagesErr.message}`);
    }

    // Re-fetch the shares row so created_at and other DB-set fields are accurate.
    const { data: shareData, error: fetchErr } = await sb
      .from('shares')
      .select('*')
      .eq('token', token)
      .single();
    if (fetchErr) throw new Error(`SupabaseShareStore.create (fetch): ${fetchErr.message}`);

    return rowToRecord(shareData as ShareRow, input.pages);
  }

  async findByToken(token: string): Promise<ShareRecord | null> {
    const sb = supabaseServer();

    const { data: shareData, error: shareErr } = await sb
      .from('shares')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (shareErr) throw new Error(`SupabaseShareStore.findByToken: ${shareErr.message}`);
    if (!shareData) return null;

    const { data: pageData, error: pageErr } = await sb
      .from('share_pages')
      .select('*')
      .eq('token', token)
      .order('position', { ascending: true });
    if (pageErr) throw new Error(`SupabaseShareStore.findByToken (pages): ${pageErr.message}`);

    const pages = pageRowsToSnapshots((pageData ?? []) as SharePageRow[]);
    return rowToRecord(shareData as ShareRow, pages);
  }

  async list(): Promise<ShareRecord[]> {
    const sb = supabaseServer();

    const { data: sharesData, error: sharesErr } = await sb
      .from('shares')
      .select('*')
      .order('created_at', { ascending: false });
    if (sharesErr) throw new Error(`SupabaseShareStore.list: ${sharesErr.message}`);

    const shares = (sharesData ?? []) as ShareRow[];
    if (shares.length === 0) return [];

    // Single round-trip for all pages — NOT N queries.
    const tokens = shares.map((s) => s.token);
    const { data: pagesData, error: pagesErr } = await sb
      .from('share_pages')
      .select('*')
      .in('token', tokens)
      .order('position', { ascending: true });
    if (pagesErr) throw new Error(`SupabaseShareStore.list (pages): ${pagesErr.message}`);

    // Group pages by token in JS.
    const pagesByToken = new Map<string, SharePageRow[]>();
    for (const page of (pagesData ?? []) as SharePageRow[]) {
      const existing = pagesByToken.get(page.token);
      if (existing) {
        existing.push(page);
      } else {
        pagesByToken.set(page.token, [page]);
      }
    }

    return shares.map((row) => {
      const pages = pageRowsToSnapshots(pagesByToken.get(row.token) ?? []);
      return rowToRecord(row, pages);
    });
  }

  async rename(token: string, name: string): Promise<ShareRecord | null> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('shares')
      .update({ name })
      .eq('token', token)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseShareStore.rename: ${error.message}`);
    if (!data) return null;

    // Fetch pages so the returned record is fully populated.
    const { data: pageData, error: pageErr } = await sb
      .from('share_pages')
      .select('*')
      .eq('token', token)
      .order('position', { ascending: true });
    if (pageErr) throw new Error(`SupabaseShareStore.rename (pages): ${pageErr.message}`);

    const pages = pageRowsToSnapshots((pageData ?? []) as SharePageRow[]);
    return rowToRecord(data as ShareRow, pages);
  }

  /**
   * Idempotent revoke (matches MemoryShareStore.revoke):
   *   1. find row; null → return null
   *   2. if revoked_at already set → return existing
   *   3. else update revoked_at to now() and return updated row
   *
   * The SELECT-then-UPDATE pattern is fine for M5 scale (no write contention
   * on individual shares in the "show clients" use case). If contention ever
   * surfaces, M5b could replace with a Postgres function that does the check
   * atomically — but YAGNI for now.
   */
  async revoke(token: string): Promise<ShareRecord | null> {
    const existing = await this.findByToken(token);
    if (!existing) return null;
    if (existing.revokedAt) return existing;

    const sb = supabaseServer();
    const { data, error } = await sb
      .from('shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseShareStore.revoke: ${error.message}`);
    if (!data) return null;

    // Reuse pages already fetched by findByToken — pages don't change during revoke.
    return rowToRecord(data as ShareRow, existing.pages);
  }

  /**
   * Throttled view tracking via `share_view_buckets` (the M5 table that exists
   * specifically for this). Algorithm:
   *   1. Compute bucket = floor(now / windowMs) * windowMs as ISO string
   *   2. INSERT INTO share_view_buckets (token, bucket_started_at). The table's
   *      composite PK on (token, bucket_started_at) means duplicate insert
   *      attempts within the same window collide with Postgres error 23505.
   *   3. On 23505 → return false (already counted this window)
   *   4. On success → bump shares.view_count + set last_viewed_at, return true
   *      (if the counter update fails, swallow — bucket row is source of truth
   *      per Rule 5)
   *   5. Any other error propagates
   */
  async trackViewIfNotRecent(token: string, windowMs: number): Promise<boolean> {
    // Cross-backend parity with MemoryShareStore: missing or revoked shares
    // must NOT accumulate views. Without this guard, revoked shares would
    // silently increment view_count via lingering bucket inserts.
    const share = await this.findByToken(token);
    if (!share || share.revokedAt) return false;

    const sb = supabaseServer();
    const bucketMs = Math.floor(Date.now() / windowMs) * windowMs;
    const bucketIso = new Date(bucketMs).toISOString();

    const { error: bucketErr } = await sb
      .from('share_view_buckets')
      .insert({ token, bucket_started_at: bucketIso });
    if (bucketErr) {
      // 23505 = unique_violation in Postgres
      if (bucketErr.code === '23505') return false;
      throw new Error(`SupabaseShareStore.trackViewIfNotRecent (bucket): ${bucketErr.message}`);
    }

    // Fetch current view_count to compute the new value (no atomic increment
    // available in supabase-js without an RPC). Race: parallel views in the
    // SAME window are throttled by the bucket insert, so only one update
    // proceeds per (token, window) — no actual contention here.
    const { data: existing } = await sb
      .from('shares')
      .select('view_count')
      .eq('token', token)
      .maybeSingle();
    const newCount = (existing?.view_count ?? 0) + 1;

    const { error: updateErr } = await sb
      .from('shares')
      .update({
        view_count: newCount,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('token', token);

    // Per Rule 5, counter-update failures don't propagate — the bucket row
    // is already in the table and counts as the source of truth for "viewed".
    if (updateErr) {
      console.error(
        `[SupabaseShareStore.trackViewIfNotRecent] counter update failed for token ${token}: ${updateErr.message}`,
      );
    }
    return true;
  }
}

function pageRowsToSnapshots(rows: SharePageRow[]): SharePageSnapshot[] {
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    artifactId: r.artifact_id,
    position: r.position,
  }));
}

function rowToRecord(row: ShareRow, pages: SharePageSnapshot[]): ShareRecord {
  return {
    token: row.token,
    siteId: row.site_id,
    pages,
    name: row.name,
    revokedAt: row.revoked_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
    createdAt: row.created_at,
  };
}
