import { describe, it, expect } from 'vitest';
import { diffTaxonomies } from '../diff';
import { TAXONOMY_SCHEMA_VERSION, type Taxonomy, type TaxonomyEntry } from '@/lib/types';

function entry(overrides: Partial<TaxonomyEntry>): TaxonomyEntry {
  return {
    id: 'editorial',
    bucket: 'aesthetic',
    name: 'Editorial',
    shortDefinition: 's',
    coreMood: 'm',
    bestUseCase: 'u',
    distinctiveSignals: ['a'],
    notes: '',
    notionId: 'n-1',
    hasOverride: true,
    ...overrides,
  };
}

const empty: Taxonomy = {
  syncedAt: '2026-04-14T10:00:00.000Z',
  syncedBy: 't',
  schemaVersion: TAXONOMY_SCHEMA_VERSION,
  aesthetics: [],
  layouts: [],
  interactions: [],
  systems: [],
};

describe('diffTaxonomies', () => {
  it('empty diff for identical taxonomies', () => {
    const d = diffTaxonomies(empty, empty);
    expect(d.added).toHaveLength(0);
    expect(d.modified).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.renamed).toHaveLength(0);
  });

  it('detects added', () => {
    const next = { ...empty, aesthetics: [entry({})] };
    expect(diffTaxonomies(empty, next).added).toHaveLength(1);
  });

  it('detects removed', () => {
    const prev = { ...empty, aesthetics: [entry({})] };
    expect(diffTaxonomies(prev, empty).removed).toHaveLength(1);
  });

  it('detects modified (same notionId, different content)', () => {
    const prev = { ...empty, aesthetics: [entry({ notes: 'old' })] };
    const next = { ...empty, aesthetics: [entry({ notes: 'new' })] };
    const d = diffTaxonomies(prev, next);
    expect(d.modified).toHaveLength(1);
    expect(d.modified[0]?.changedFields).toContain('notes');
  });

  it('detects rename (same notionId, different name)', () => {
    const prev = { ...empty, aesthetics: [entry({ name: 'Old', id: 'old' })] };
    const next = { ...empty, aesthetics: [entry({ name: 'New', id: 'new' })] };
    const d = diffTaxonomies(prev, next);
    expect(d.renamed).toHaveLength(1);
    expect(d.renamed[0]?.from).toBe('Old');
  });
});
