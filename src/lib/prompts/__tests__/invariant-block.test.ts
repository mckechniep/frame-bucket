/**
 * Rule 8 cross-assembler byte-identity guard.
 *
 * All three assemblers (generation, iteration, subpage) must emit block[1]
 * through formatInvariantBlock so the Anthropic prompt cache is shared across
 * call types. This file mocks ../canon-layers directly, keeping
 * formatInvariantBlock real (via importOriginal), so each assembler's real
 * formatInvariantBlock call is exercised against uniform layer data.
 *
 * Lives in a dedicated file rather than subpage-assembler.test.ts because
 * vi.mock is hoisted to file scope and would conflict with that file's
 * ../loader mock strategy.
 */

import { describe, it, expect, vi } from 'vitest';
import { formatInvariantBlock } from '../canon-layers';

// vi.mock is hoisted — all values must be inline literals, not variables.
vi.mock('../canon-layers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canon-layers')>();
  return {
    ...actual,
    loadInvariantLayers: vi.fn().mockResolvedValue({
      posture: 'CROSS_POSTURE',
      baseCanon: 'CROSS_CANON',
      outputContract: 'CROSS_CONTRACT',
    }),
    loadCanonLayers: vi.fn().mockResolvedValue({
      posture: 'CROSS_POSTURE',
      baseCanon: 'CROSS_CANON',
      outputContract: 'CROSS_CONTRACT',
      override: null,
    }),
  };
});

// Mirror of the inline literals above — used in assertions.
const CROSS_LAYERS = {
  posture: 'CROSS_POSTURE',
  baseCanon: 'CROSS_CANON',
  outputContract: 'CROSS_CONTRACT',
};

const minimalRecipe = {
  brief: { projectName: 'X', industry: 'Y', posture: 'boutique' as const, description: 'z' },
  aesthetic: {
    id: 'a',
    bucket: 'aesthetic' as const,
    name: 'A',
    shortDefinition: 's',
    coreMood: 'm',
    bestUseCase: 'u',
    distinctiveSignals: ['x'],
    notes: '',
    notionId: 'n',
    hasOverride: false,
  },
  layout: {
    id: 'b',
    bucket: 'layout' as const,
    name: 'B',
    shortDefinition: 's',
    coreMood: 'm',
    bestUseCase: 'u',
    distinctiveSignals: ['x'],
    notes: '',
    notionId: 'n',
    hasOverride: false,
  },
};

describe('Rule 8 — all three assemblers emit byte-identical invariant block[1]', () => {
  it('assembleSubpageRequest block[1] equals formatInvariantBlock(CROSS_LAYERS)', async () => {
    const { assembleSubpageRequest } = await import('../subpage-assembler');
    const req = await assembleSubpageRequest({
      contractMd: 'contract',
      pageBrief: 'brief',
      pageTitle: 'Test',
      pageSlug: '/test',
      navManifest: [{ slug: '/test', title: 'Test', position: 0 }],
      landingStructure: '<h1>Home</h1>',
    });
    expect(req.system[1]?.text).toBe(formatInvariantBlock(CROSS_LAYERS));
  });

  it('assembleGenerationRequest block[1] equals formatInvariantBlock(CROSS_LAYERS)', async () => {
    const { assembleGenerationRequest } = await import('../assembler');
    const req = await assembleGenerationRequest(minimalRecipe);
    expect(req.system[1]?.text).toBe(formatInvariantBlock(CROSS_LAYERS));
  });

  it('assembleIterationRequest block[1] equals formatInvariantBlock(CROSS_LAYERS)', async () => {
    const { assembleIterationRequest } = await import('../iteration-assembler');
    const req = await assembleIterationRequest({
      recipe: minimalRecipe,
      previousHtml: '<!DOCTYPE html><html><body></body></html>',
      previousArtifactId: 'art-1',
      feedback: 'Make it better',
    });
    expect(req.system[1]?.text).toBe(formatInvariantBlock(CROSS_LAYERS));
  });

  it('all three block[1] texts are the same string', async () => {
    const { assembleSubpageRequest } = await import('../subpage-assembler');
    const { assembleGenerationRequest } = await import('../assembler');
    const { assembleIterationRequest } = await import('../iteration-assembler');

    const [subpageReq, genReq, iterReq] = await Promise.all([
      assembleSubpageRequest({
        contractMd: 'contract',
        pageBrief: 'brief',
        pageTitle: 'Test',
        pageSlug: '/test',
        navManifest: [{ slug: '/test', title: 'Test', position: 0 }],
        landingStructure: '<h1>Home</h1>',
      }),
      assembleGenerationRequest(minimalRecipe),
      assembleIterationRequest({
        recipe: minimalRecipe,
        previousHtml: '<!DOCTYPE html><html><body></body></html>',
        previousArtifactId: 'art-1',
        feedback: 'feedback',
      }),
    ]);

    const subpageBlock1 = subpageReq.system[1]?.text;
    const genBlock1 = genReq.system[1]?.text;
    const iterBlock1 = iterReq.system[1]?.text;

    expect(subpageBlock1).toBe(genBlock1);
    expect(genBlock1).toBe(iterBlock1);
  });
});
