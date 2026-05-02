import { describe, it, expect } from 'vitest';
import { mapNotionPageToEntry } from '../mapper';
import samplePage from '../fixtures/sample-page.json';

describe('mapNotionPageToEntry', () => {
  it('maps a well-formed aesthetic page', () => {
    const entry = mapNotionPageToEntry(samplePage as never, 'aesthetic', true);
    expect(entry).toEqual({
      id: 'editorial',
      bucket: 'aesthetic',
      name: 'Editorial',
      shortDefinition: 'A type-led, content-first direction rooted in magazine design.',
      coreMood: 'Considered, editorial, unhurried.',
      bestUseCase: 'Brand stories, long-form content.',
      distinctiveSignals: ['type-led hierarchy', 'generous whitespace', 'asymmetric grids'],
      notes: 'Editorial shines when content is actually good.',
      notionId: '00000000-0000-0000-0000-0000000000aa',
      hasOverride: true,
    });
  });

  it('falls back to comma-split rich_text when Distinctive Signals is rich_text', () => {
    const richTextVariant = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Distinctive Signals': {
          id: 'signals',
          type: 'rich_text',
          rich_text: [{ plain_text: 'raw textures, oversized type, asymmetric crashes' }],
        },
      },
    };
    const entry = mapNotionPageToEntry(richTextVariant as never, 'aesthetic', false);
    expect(entry.distinctiveSignals).toEqual([
      'raw textures',
      'oversized type',
      'asymmetric crashes',
    ]);
    expect(entry.hasOverride).toBe(false);
  });

  it('respects parenthesized commas in rich_text fallback (no premature split)', () => {
    const variant = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Distinctive Signals': {
          id: 'signals',
          type: 'rich_text',
          rich_text: [
            {
              plain_text:
                'Monospace typography (Courier, IBM Plex Mono, Fira Code), green or amber on black, scanline overlays',
            },
          ],
        },
      },
    };
    const entry = mapNotionPageToEntry(variant as never, 'aesthetic', false);
    expect(entry.distinctiveSignals).toEqual([
      'Monospace typography (Courier, IBM Plex Mono, Fira Code)',
      'green or amber on black',
      'scanline overlays',
    ]);
  });

  it('throws when Short Definition is missing', () => {
    const broken = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Short Definition': { type: 'rich_text', rich_text: [] },
      },
    };
    expect(() => mapNotionPageToEntry(broken as never, 'aesthetic', true)).toThrow(
      /Short Definition.*Editorial/,
    );
  });
});
