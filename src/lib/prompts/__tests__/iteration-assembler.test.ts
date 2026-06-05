import { describe, it, expect, vi } from 'vitest';
import { assembleIterationRequest } from '../iteration-assembler';
import type { IterationRequest } from '@/lib/types';
import type { TaxonomyEntry } from '@/lib/types';

// Mock loadCanonLayers so each test controls the layers independently of the
// filesystem. The loader itself is already tested via assembler.test.ts.
// formatInvariantBlock is kept real (via importOriginal) so iteration-assembler
// can call it and produce the correct block[1] text.
vi.mock('../canon-layers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canon-layers')>();
  return {
    ...actual,
    loadCanonLayers: vi.fn().mockResolvedValue({
      posture: 'POSTURE CONTENT',
      baseCanon: 'BASE CANON CONTENT',
      outputContract: 'OUTPUT CONTRACT CONTENT',
      override: 'AESTHETIC OVERRIDE CONTENT',
    }),
  };
});

import { loadCanonLayers } from '../canon-layers';

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

const baseRequest: IterationRequest = {
  recipe: {
    brief: {
      projectName: 'Test Project',
      industry: 'Technology',
      posture: 'startup',
      description: 'A test description',
    },
    aesthetic: entry({ id: 'editorial', name: 'Editorial', hasOverride: true }),
    layout: entry({
      id: 'editorial-spread',
      bucket: 'layout',
      name: 'Editorial Spread',
      hasOverride: false,
    }),
  },
  previousHtml: '<!DOCTYPE html><html><body>old content</body></html>',
  previousArtifactId: 'artifact-123',
  feedback: 'Make the header bigger and use a darker background.',
};

describe('assembleIterationRequest', () => {
  it('returns 3 system blocks when aesthetic override is present', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.system).toHaveLength(3);
  });

  it('returns 2 system blocks when aesthetic override is absent', async () => {
    vi.mocked(loadCanonLayers).mockResolvedValueOnce({
      posture: 'POSTURE CONTENT',
      baseCanon: 'BASE CANON CONTENT',
      outputContract: 'OUTPUT CONTRACT CONTENT',
      override: null,
    });
    const req = await assembleIterationRequest(baseRequest);
    expect(req.system).toHaveLength(2);
  });

  it('first system block has no cache_control (intro block)', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.system[0]?.cache_control).toBeUndefined();
    expect(req.system[0]?.text).toContain('senior frontend designer');
  });

  it('second system block (canon) has cache_control ephemeral', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.system[1]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('third system block (override) has cache_control ephemeral', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.system[2]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('canon block contains posture, base canon, and output contract', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const canonBlock = req.system[1]?.text ?? '';
    expect(canonBlock).toContain('POSTURE CONTENT');
    expect(canonBlock).toContain('BASE CANON CONTENT');
    expect(canonBlock).toContain('OUTPUT CONTRACT CONTENT');
  });

  it('user message contains the previous HTML verbatim', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain(baseRequest.previousHtml);
  });

  it('user message wraps previous HTML in triple-backtick html fence', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('```html\n' + baseRequest.previousHtml + '\n```');
  });

  it('user message contains the feedback verbatim', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain(baseRequest.feedback);
  });

  it('user message contains the feedback as a blockquote', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain(`> ${baseRequest.feedback}`);
  });

  it('user message contains the aesthetic id and name in recipe summary', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('aesthetic=editorial (Editorial)');
  });

  it('user message contains the layout id and name in recipe summary', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('layout=editorial-spread (Editorial Spread)');
  });

  it('user message contains the original brief project name', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('Test Project');
  });

  it('max_tokens is 32000', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.max_tokens).toBe(32000);
  });

  it('stream is true', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.stream).toBe(true);
  });

  it('model is claude-opus-4-7', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.model).toBe('claude-opus-4-7');
  });

  it('messages array has exactly one user message', async () => {
    const req = await assembleIterationRequest(baseRequest);
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0]?.role).toBe('user');
  });

  it('user message contains nav-links preservation instruction', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('fb:nav-links:start');
    expect(content).toContain('fb:nav-links:end');
    expect(content).toContain('Preserve');
  });

  it('nav marker preservation instruction lives in user content, not in any cached system block', async () => {
    const req = await assembleIterationRequest(baseRequest);
    const cachedBlocks = req.system.filter((b) => b.cache_control?.type === 'ephemeral');
    for (const block of cachedBlocks) {
      expect(block.text).not.toContain('fb:nav-links');
    }
    expect(req.messages[0]?.content ?? '').toContain('fb:nav-links');
  });

  it('includes interaction and system in recipe summary when present', async () => {
    const requestWithExtras: IterationRequest = {
      ...baseRequest,
      recipe: {
        ...baseRequest.recipe,
        interaction: entry({
          id: 'hover-reveal',
          bucket: 'interaction',
          name: 'Hover Reveal',
          hasOverride: false,
        }),
        system: entry({
          id: 'dark-mode',
          bucket: 'system',
          name: 'Dark Mode',
          hasOverride: false,
        }),
      },
    };
    const req = await assembleIterationRequest(requestWithExtras);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('interaction=hover-reveal (Hover Reveal)');
    expect(content).toContain('system=dark-mode (Dark Mode)');
  });
});
