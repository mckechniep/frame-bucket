import { describe, it, expect, vi } from 'vitest';
import { assembleRecommendationRequest } from '../recommendation-assembler';
import type { Brief } from '@/lib/types/recipe';
import type { Taxonomy, TaxonomyEntry } from '@/lib/types/taxonomy';

vi.mock('../loader', () => ({
  loadPosture: vi.fn().mockResolvedValue('POSTURE CONTENT'),
  loadBaseCanon: vi.fn().mockResolvedValue('BASE CANON CONTENT'),
  loadOutputContract: vi.fn().mockResolvedValue('OUTPUT CONTRACT CONTENT'),
  loadAestheticOverride: vi.fn().mockResolvedValue(null),
  loadRecommendationSystemPrompt: vi.fn().mockResolvedValue('RECOMMENDATION SYSTEM PROMPT CONTENT'),
}));

function makeEntry(overrides: Partial<TaxonomyEntry>): TaxonomyEntry {
  return {
    id: 'default-id',
    bucket: 'aesthetic',
    name: 'Default Name',
    shortDefinition: 'short def',
    coreMood: 'core mood here',
    bestUseCase: 'best use case here',
    distinctiveSignals: ['signal-a', 'signal-b'],
    notes: 'These are private notes that should NOT appear in user message.',
    notionId: 'notion-123',
    hasOverride: false,
    ...overrides,
  };
}

const fixtureTaxonomy: Taxonomy = {
  syncedAt: '2025-01-01T00:00:00Z',
  syncedBy: 'test',
  schemaVersion: 1,
  aesthetics: [
    makeEntry({ id: 'editorial', bucket: 'aesthetic', name: 'Editorial' }),
    makeEntry({ id: 'swiss', bucket: 'aesthetic', name: 'Swiss' }),
  ],
  layouts: [
    makeEntry({ id: 'editorial-spread', bucket: 'layout', name: 'Editorial Spread' }),
    makeEntry({ id: 'bento', bucket: 'layout', name: 'Bento' }),
  ],
  interactions: [makeEntry({ id: 'scroll-reveal', bucket: 'interaction', name: 'Scroll Reveal' })],
  systems: [makeEntry({ id: 'material-you', bucket: 'system', name: 'Material You' })],
};

const fixtureBrief: Brief = {
  projectName: 'Acme Corp',
  industry: 'Technology',
  vibe: 'scrappy-startup',
  colorsProvided: ['#ff0000', '#0000ff'],
  description: 'A fast-moving startup landing page.',
};

describe('assembleRecommendationRequest', () => {
  it('uses the correct model id', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    expect(req.model).toBe('claude-haiku-4-5');
  });

  it('system block has cache_control ephemeral', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    expect(req.system).toHaveLength(1);
    expect(req.system[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('user message contains all bucket entry names and ids from the taxonomy', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    const content = req.messages[0]?.content ?? '';

    const allEntries = [
      ...fixtureTaxonomy.aesthetics,
      ...fixtureTaxonomy.layouts,
      ...fixtureTaxonomy.interactions,
      ...fixtureTaxonomy.systems,
    ];

    for (const entry of allEntries) {
      expect(content).toContain(entry.name);
      expect(content).toContain(entry.id);
    }
  });

  it('user message does NOT contain the notes field of any entry', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    const content = req.messages[0]?.content ?? '';
    expect(content).not.toContain('private notes that should NOT appear');
  });

  it('user message does NOT contain private taxonomy fields (shortDefinition, notionId, hasOverride)', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    const content = req.messages[0]?.content ?? '';
    expect(content).not.toContain('short def');
    expect(content).not.toContain('notion-123');
  });

  it('max_tokens is bounded at 4000', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    expect(req.max_tokens).toBeLessThanOrEqual(4000);
    expect(req.max_tokens).toBe(4000);
  });

  it('stream is explicitly false', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    expect(req.stream).toBe(false);
  });

  it('user message contains brief fields', async () => {
    const req = await assembleRecommendationRequest(fixtureBrief, fixtureTaxonomy);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('Acme Corp');
    expect(content).toContain('Technology');
    expect(content).toContain('scrappy-startup');
  });
});
