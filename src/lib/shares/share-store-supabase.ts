import type { ShareRecord, ShareStore } from './share-store';
import { generateShareToken } from './token';
import { supabaseServer } from '@/lib/supabase/client-server';

type ShareRow = {
  token: string;
  artifact_id: string;
  name: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  created_at: string;
};

export class SupabaseShareStore implements ShareStore {
  async create({ artifactId, name }: { artifactId: string; name: string }): Promise<ShareRecord> {
    const sb = supabaseServer();
    const token = generateShareToken();
    const { data, error } = await sb
      .from('shares')
      .insert({ token, artifact_id: artifactId, name })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseShareStore.create: ${error.message}`);
    return rowToRecord(data);
  }

  async findByToken(token: string): Promise<ShareRecord | null> {
    const sb = supabaseServer();
    const { data, error } = await sb.from('shares').select('*').eq('token', token).maybeSingle();
    if (error) throw new Error(`SupabaseShareStore.findByToken: ${error.message}`);
    return data ? rowToRecord(data) : null;
  }

  async list(): Promise<ShareRecord[]> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('shares')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`SupabaseShareStore.list: ${error.message}`);
    return (data ?? []).map(rowToRecord);
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
    return data ? rowToRecord(data) : null;
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
    return data ? rowToRecord(data) : null;
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

function rowToRecord(row: ShareRow): ShareRecord {
  return {
    token: row.token,
    artifactId: row.artifact_id,
    name: row.name,
    revokedAt: row.revoked_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
    createdAt: row.created_at,
  };
}
