import { describe, it, expect } from 'vitest';
import { TaxonomyEntrySchema, NotionPropertiesSchema } from '../taxonomy';

describe('TaxonomyEntrySchema', () => {
  it('accepts a valid entry', () => {
    const valid = {
      id: 'editorial',
      bucket: 'aesthetic',
      name: 'Editorial',
      shortDefinition: 'Content-first direction.',
      coreMood: 'Considered, editorial.',
      bestUseCase: 'Brand stories.',
      distinctiveSignals: ['type-led hierarchy', 'generous whitespace'],
      notes: '',
      notionId: 'page-id-1',
      hasOverride: true,
    };
    expect(TaxonomyEntrySchema.parse(valid)).toEqual(valid);
  });

  it('rejects entry with empty distinctiveSignals', () => {
    expect(() =>
      TaxonomyEntrySchema.parse({
        id: 'x',
        bucket: 'aesthetic',
        name: 'X',
        shortDefinition: 'x',
        coreMood: 'x',
        bestUseCase: 'x',
        distinctiveSignals: [],
        notes: '',
        notionId: 'p',
        hasOverride: false,
      }),
    ).toThrow();
  });

  it('rejects entry missing shortDefinition', () => {
    expect(() =>
      TaxonomyEntrySchema.parse({
        id: 'x',
        bucket: 'layout',
        name: 'X',
        coreMood: 'x',
        bestUseCase: 'x',
        distinctiveSignals: ['y'],
        notes: '',
        notionId: 'p',
        hasOverride: false,
      }),
    ).toThrow();
  });
});

describe('NotionPropertiesSchema', () => {
  it('parses expected Notion shape', () => {
    const input = {
      name: 'Editorial',
      shortDefinition: 'x',
      coreMood: 'x',
      bestUseCase: 'x',
      distinctiveSignals: ['a', 'b'],
      notes: '',
    };
    expect(NotionPropertiesSchema.parse(input)).toEqual(input);
  });
});
