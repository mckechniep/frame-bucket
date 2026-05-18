import crypto from 'node:crypto';
import type { ArchiveRecord, ArchiveStore } from './archive-interface';
import { supabaseServer } from '@/lib/supabase/client-server';

function stripIterSuffix(summary: string): string {
  return summary.replace(/\s*\(iter \d+\)\s*$/, '');
}

export class SupabaseArchiveStore implements ArchiveStore {
  async save(
    record: Omit<ArchiveRecord, 'iterationRound'> & Partial<Pick<ArchiveRecord, 'iterationRound'>>,
  ): Promise<string> {
    const iterationRound = record.iterationRound ?? 0;
    const baseSummary = stripIterSuffix(record.recipeSummary);
    const recipeSummary =
      iterationRound > 0 ? `${baseSummary} (iter ${iterationRound})` : baseSummary;

    const id = crypto.randomUUID();
    const sb = supabaseServer();

    // `meta` is the jsonb column. All non-relational fields go here, so a future
    // schema change to add/remove fields doesn't require a migration.
    const meta = {
      recipeSummary,
      modelId: record.modelId,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cacheReadTokens: record.cacheReadTokens,
      cost: record.cost,
      generatedAt: record.generatedAt,
    };

    const { error } = await sb.from('artifacts').insert({
      id,
      html: record.html,
      html_source: record.htmlSource ?? null,
      meta,
      parent_id: record.parentArtifactId ?? null,
      iteration_round: iterationRound,
    });
    if (error) throw new Error(`SupabaseArchiveStore.save: ${error.message}`);
    return id;
  }

  async exists(id: string): Promise<boolean> {
    const sb = supabaseServer();
    const { count, error } = await sb
      .from('artifacts')
      .select('id', { count: 'exact', head: true })
      .eq('id', id);
    if (error) throw new Error(`SupabaseArchiveStore.exists: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async existsMany(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const sb = supabaseServer();
    const { data, error } = await sb.from('artifacts').select('id').in('id', ids);
    if (error) throw new Error(`SupabaseArchiveStore.existsMany: ${error.message}`);
    return new Set((data ?? []).map((r) => r.id));
  }

  async read(id: string): Promise<ArchiveRecord | null> {
    const sb = supabaseServer();
    const { data, error } = await sb.from('artifacts').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SupabaseArchiveStore.read: ${error.message}`);
    if (!data) return null;
    return rowToRecord(data);
  }

  async getChildren(parentId: string): Promise<Array<ArchiveRecord & { id: string }>> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('artifacts')
      .select('*')
      .eq('parent_id', parentId)
      .order('iteration_round', { ascending: true });
    if (error) throw new Error(`SupabaseArchiveStore.getChildren: ${error.message}`);
    return (data ?? []).map((row) => ({ ...rowToRecord(row), id: row.id }));
  }
}

type ArtifactRow = {
  id: string;
  html: string;
  html_source: string | null;
  meta: unknown;
  parent_id: string | null;
  iteration_round: number;
  created_at: string;
};

function rowToRecord(row: ArtifactRow): ArchiveRecord {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  return {
    recipeSummary: String(meta.recipeSummary ?? ''),
    html: row.html,
    htmlSource: row.html_source ?? undefined,
    modelId: String(meta.modelId ?? ''),
    inputTokens: Number(meta.inputTokens ?? 0),
    outputTokens: Number(meta.outputTokens ?? 0),
    cacheReadTokens: Number(meta.cacheReadTokens ?? 0),
    cost: Number(meta.cost ?? 0),
    generatedAt: String(meta.generatedAt ?? ''),
    parentArtifactId: row.parent_id ?? undefined,
    iterationRound: row.iteration_round,
  };
}
