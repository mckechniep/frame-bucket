import { getNotionClient } from '@/lib/notion/client';
import { fetchBucket, type NotionPageLike } from '@/lib/notion/fetcher';
import { mapNotionPageToEntry } from '@/lib/notion/mapper';
import {
  TAXONOMY_SCHEMA_VERSION,
  type Bucket,
  type Taxonomy,
  type TaxonomyEntry,
} from '@/lib/types';
import { diffTaxonomies, summarizeDiff, type TaxonomyDiff } from './diff';
import type { TaxonomyStore } from './store';

export interface SyncDbs {
  aesthetic: string;
  layout: string;
  interaction: string;
  system: string;
}

export interface SyncOptions {
  store: TaxonomyStore;
  dbs: SyncDbs;
  syncedBy: string;
  commit: boolean;
  hasOverride: (bucket: Bucket, id: string) => boolean;
  client?: ReturnType<typeof getNotionClient>;
}

export interface SyncResult {
  proposed: Taxonomy;
  previous: Taxonomy | null;
  diff: TaxonomyDiff;
  committed: boolean;
}

function emptyTaxonomy(syncedBy: string): Taxonomy {
  return {
    syncedAt: new Date().toISOString(),
    syncedBy,
    schemaVersion: TAXONOMY_SCHEMA_VERSION,
    aesthetics: [],
    layouts: [],
    interactions: [],
    systems: [],
  };
}

function buildEntries(
  pages: NotionPageLike[],
  bucket: Bucket,
  hasOverride: (b: Bucket, id: string) => boolean,
): TaxonomyEntry[] {
  return pages.map((p) => {
    const t = mapNotionPageToEntry(p, bucket, false);
    return { ...t, hasOverride: hasOverride(bucket, t.id) };
  });
}

export async function performSync(options: SyncOptions): Promise<SyncResult> {
  const client = options.client ?? getNotionClient();
  const [ae, la, inte, sy] = await Promise.all([
    fetchBucket(client, options.dbs.aesthetic),
    fetchBucket(client, options.dbs.layout),
    fetchBucket(client, options.dbs.interaction),
    fetchBucket(client, options.dbs.system),
  ]);

  const proposed: Taxonomy = {
    ...emptyTaxonomy(options.syncedBy),
    aesthetics: buildEntries(ae, 'aesthetic', options.hasOverride),
    layouts: buildEntries(la, 'layout', options.hasOverride),
    interactions: buildEntries(inte, 'interaction', options.hasOverride),
    systems: buildEntries(sy, 'system', options.hasOverride),
  };

  const previous = await options.store.get();
  const baseline = previous ?? emptyTaxonomy(options.syncedBy);
  const diff = diffTaxonomies(baseline, proposed);

  if (options.commit) {
    await options.store.set(proposed);
    await options.store.appendHistory({
      at: proposed.syncedAt,
      by: proposed.syncedBy,
      summary: summarizeDiff(diff),
      added: diff.added.length,
      modified: diff.modified.length,
      removed: diff.removed.length,
      renamed: diff.renamed.length,
    });
  }

  return { proposed, previous, diff, committed: options.commit };
}
