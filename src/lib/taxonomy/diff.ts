import type { Taxonomy, TaxonomyEntry, Bucket } from '@/lib/types';

export interface TaxonomyDiff {
  added: TaxonomyEntry[];
  removed: TaxonomyEntry[];
  modified: Array<{ entry: TaxonomyEntry; changedFields: string[] }>;
  renamed: Array<{ from: string; to: string; notionId: string }>;
}

const BUCKETS: Array<{ key: Bucket; arr: keyof Taxonomy }> = [
  { key: 'aesthetic', arr: 'aesthetics' },
  { key: 'layout', arr: 'layouts' },
  { key: 'interaction', arr: 'interactions' },
  { key: 'system', arr: 'systems' },
];

const COMPARE_FIELDS: Array<keyof TaxonomyEntry> = [
  'shortDefinition',
  'coreMood',
  'bestUseCase',
  'distinctiveSignals',
  'notes',
];

function fieldEqual(a: TaxonomyEntry, b: TaxonomyEntry, f: keyof TaxonomyEntry): boolean {
  const av = a[f];
  const bv = b[f];
  if (Array.isArray(av) && Array.isArray(bv)) {
    return av.length === bv.length && av.every((v, i) => v === bv[i]);
  }
  return av === bv;
}

export function diffTaxonomies(prev: Taxonomy, next: Taxonomy): TaxonomyDiff {
  const added: TaxonomyEntry[] = [];
  const removed: TaxonomyEntry[] = [];
  const modified: Array<{ entry: TaxonomyEntry; changedFields: string[] }> = [];
  const renamed: Array<{ from: string; to: string; notionId: string }> = [];

  for (const { arr } of BUCKETS) {
    const prevArr = prev[arr] as TaxonomyEntry[];
    const nextArr = next[arr] as TaxonomyEntry[];
    const prevById = new Map(prevArr.map((e) => [e.notionId, e]));
    const nextById = new Map(nextArr.map((e) => [e.notionId, e]));

    for (const [id, e] of nextById) {
      if (!prevById.has(id)) added.push(e);
    }

    for (const [id, e] of prevById) {
      const updated = nextById.get(id);
      if (!updated) {
        removed.push(e);
        continue;
      }
      if (updated.name !== e.name) {
        renamed.push({ from: e.name, to: updated.name, notionId: id });
      }
      const changedFields = COMPARE_FIELDS.filter((f) => !fieldEqual(e, updated, f));
      if (changedFields.length > 0) modified.push({ entry: updated, changedFields });
    }
  }

  return { added, removed, modified, renamed };
}

export function summarizeDiff(d: TaxonomyDiff): string {
  return `+${d.added.length} / ~${d.modified.length} / -${d.removed.length} / renamed ${d.renamed.length}`;
}
