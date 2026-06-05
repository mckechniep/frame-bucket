import { describe, it, expect, vi } from 'vitest';
import { assembleGenerationRequest } from '../assembler';
import { loadAestheticOverride } from '../loader';
import type { Recipe, TaxonomyEntry } from '@/lib/types';

vi.mock('../loader', () => ({
  loadPosture: vi.fn().mockResolvedValue('POSTURE CONTENT'),
  loadBaseCanon: vi.fn().mockResolvedValue('BASE CANON CONTENT'),
  loadOutputContract: vi.fn().mockResolvedValue('OUTPUT CONTRACT CONTENT'),
  loadAestheticOverride: vi.fn().mockResolvedValue('EDITORIAL OVERRIDE'),
}));

function entry(o: Partial<TaxonomyEntry>): TaxonomyEntry {
  return {
    id: 'editorial',
    bucket: 'aesthetic',
    name: 'Editorial',
    shortDefinition: 's',
    coreMood: 'm',
    bestUseCase: 'u',
    distinctiveSignals: ['a'],
    notes: '',
    notionId: 'n',
    hasOverride: true,
    ...o,
  };
}

const recipe: Recipe = {
  brief: {
    projectName: 'Maple St Bakery',
    industry: 'Food & Beverage',
    posture: 'boutique',
    description: 'artisanal bakery; avoid generic cafe tropes',
  },
  aesthetic: entry({ id: 'editorial', hasOverride: true }),
  layout: entry({
    id: 'editorial-spread',
    bucket: 'layout',
    name: 'Editorial Spread',
    hasOverride: false,
  }),
};

describe('assembleGenerationRequest', () => {
  it('returns two-layer-cached Anthropic message structure', async () => {
    const req = await assembleGenerationRequest(recipe);
    expect(req.system[0]?.text).toContain('senior frontend designer');
    expect(req.system.find((b) => b.text.includes('BASE CANON CONTENT'))?.cache_control).toEqual({
      type: 'ephemeral',
    });
    expect(req.system.find((b) => b.text.includes('EDITORIAL OVERRIDE'))?.cache_control).toEqual({
      type: 'ephemeral',
    });
    const firstMessage = req.messages[0];
    expect(firstMessage).toBeDefined();
    const userText = firstMessage?.content ?? '';
    expect(userText).toContain('Maple St Bakery');
    expect(userText).toContain('Editorial Spread');
  });

  it('prepends posture content into the same cached block as base canon', async () => {
    const req = await assembleGenerationRequest(recipe);
    const cachedBlock = req.system.find((b) => b.text.includes('BASE CANON CONTENT'));
    expect(cachedBlock).toBeDefined();
    expect(cachedBlock?.text).toContain('POSTURE CONTENT');
    expect(cachedBlock?.text.indexOf('POSTURE CONTENT')).toBeLessThan(
      cachedBlock?.text.indexOf('BASE CANON CONTENT') ?? Infinity,
    );
  });

  it('omits aesthetic override block when aesthetic has no override', async () => {
    vi.mocked(loadAestheticOverride).mockResolvedValueOnce(null);
    const r = { ...recipe, aesthetic: entry({ hasOverride: false }) };
    const req = await assembleGenerationRequest(r);
    expect(req.system.some((b) => b.text.includes('OVERRIDE'))).toBe(false);
  });

  it('user content contains fb:nav-links:start marker', async () => {
    const req = await assembleGenerationRequest(recipe);
    const userText = req.messages[0]?.content ?? '';
    expect(userText).toContain('fb:nav-links:start');
  });

  it('user content contains fb:nav-links:end marker', async () => {
    const req = await assembleGenerationRequest(recipe);
    const userText = req.messages[0]?.content ?? '';
    expect(userText).toContain('fb:nav-links:end');
  });

  it('nav marker instruction lives in user content, not in any cached system block', async () => {
    const req = await assembleGenerationRequest(recipe);
    const cachedBlocks = req.system.filter((b) => b.cache_control?.type === 'ephemeral');
    for (const block of cachedBlocks) {
      expect(block.text).not.toContain('fb:nav-links');
    }
    expect(req.messages[0]?.content ?? '').toContain('fb:nav-links');
  });

  it('has exactly 2 ephemeral cache_control blocks when override is present', async () => {
    const req = await assembleGenerationRequest(recipe);
    const cached = req.system.filter((b) => b.cache_control?.type === 'ephemeral');
    expect(cached).toHaveLength(2);
  });

  it('has exactly 1 ephemeral cache_control block when override is absent', async () => {
    vi.mocked(loadAestheticOverride).mockResolvedValueOnce(null);
    const r = { ...recipe, aesthetic: entry({ hasOverride: false }) };
    const req = await assembleGenerationRequest(r);
    const cached = req.system.filter((b) => b.cache_control?.type === 'ephemeral');
    expect(cached).toHaveLength(1);
  });
});
