import { describe, it, expect, vi } from 'vitest';
import { loadInvariantLayers, loadCanonLayers } from '../canon-layers';
import type { Posture } from '@/lib/types/recipe';

vi.mock('../loader', () => ({
  loadPosture: vi.fn().mockResolvedValue('POSTURE CONTENT'),
  loadBaseCanon: vi.fn().mockResolvedValue('BASE CANON CONTENT'),
  loadOutputContract: vi.fn().mockResolvedValue('OUTPUT CONTRACT CONTENT'),
  loadAestheticOverride: vi.fn().mockResolvedValue('AESTHETIC OVERRIDE CONTENT'),
}));

describe('loadInvariantLayers', () => {
  it('returns posture, baseCanon, and outputContract', async () => {
    const layers = await loadInvariantLayers();
    expect(layers.posture).toBe('POSTURE CONTENT');
    expect(layers.baseCanon).toBe('BASE CANON CONTENT');
    expect(layers.outputContract).toBe('OUTPUT CONTRACT CONTENT');
  });

  it('does not include an override field', async () => {
    const layers = await loadInvariantLayers();
    expect(Object.keys(layers)).toEqual(['posture', 'baseCanon', 'outputContract']);
  });
});

describe('loadCanonLayers (regression — existing shape unchanged)', () => {
  it('returns all four fields including override when hasOverride is true', async () => {
    const recipe = {
      brief: {
        projectName: 'Test',
        industry: 'Tech',
        posture: 'boutique' as Posture,
        description: 'test',
      },
      aesthetic: {
        id: 'editorial',
        bucket: 'aesthetic' as const,
        name: 'Editorial',
        shortDefinition: 's',
        coreMood: 'm',
        bestUseCase: 'u',
        distinctiveSignals: ['a'],
        notes: '',
        notionId: 'n',
        hasOverride: true,
      },
      layout: {
        id: 'editorial-spread',
        bucket: 'layout' as const,
        name: 'Editorial Spread',
        shortDefinition: 's',
        coreMood: 'm',
        bestUseCase: 'u',
        distinctiveSignals: ['a'],
        notes: '',
        notionId: 'n',
        hasOverride: false,
      },
    };

    const layers = await loadCanonLayers(recipe);
    expect(layers.posture).toBe('POSTURE CONTENT');
    expect(layers.baseCanon).toBe('BASE CANON CONTENT');
    expect(layers.outputContract).toBe('OUTPUT CONTRACT CONTENT');
    expect(layers.override).toBe('AESTHETIC OVERRIDE CONTENT');
  });

  it('returns null override when hasOverride is false', async () => {
    const { loadAestheticOverride } = await import('../loader');
    vi.mocked(loadAestheticOverride).mockResolvedValueOnce(null);

    const recipe = {
      brief: {
        projectName: 'Test',
        industry: 'Tech',
        posture: 'boutique' as Posture,
        description: 'test',
      },
      aesthetic: {
        id: 'minimal',
        bucket: 'aesthetic' as const,
        name: 'Minimal',
        shortDefinition: 's',
        coreMood: 'm',
        bestUseCase: 'u',
        distinctiveSignals: ['a'],
        notes: '',
        notionId: 'n',
        hasOverride: false,
      },
      layout: {
        id: 'grid',
        bucket: 'layout' as const,
        name: 'Grid',
        shortDefinition: 's',
        coreMood: 'm',
        bestUseCase: 'u',
        distinctiveSignals: ['a'],
        notes: '',
        notionId: 'n',
        hasOverride: false,
      },
    };

    const layers = await loadCanonLayers(recipe);
    expect(layers.override).toBeNull();
  });
});
