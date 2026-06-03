import { describe, it, expect } from 'vitest';
import type { IterationRequest } from '@/lib/types';
import type { z } from 'zod';
import { IterationRequestSchema } from '../iteration';

// ---------------------------------------------------------------------------
// Type-level structural test (compile-time only — no runtime cost)
// ---------------------------------------------------------------------------
// Verify that the inferred type from IterationRequestSchema is assignable to
// the explicit IterationRequest interface. The reverse is not tested here
// because BriefSchema makes `description` required (min 10) while the `Brief`
// type has `description?: string` — a deliberate divergence matching the
// pattern established in recommendation.test.ts.

type _InferredExtendsExplicit =
  z.infer<typeof IterationRequestSchema> extends IterationRequest ? true : never;

const _typeOk: _InferredExtendsExplicit = true;
void _typeOk;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validTaxonomyEntry = {
  id: 'editorial',
  bucket: 'aesthetic' as const,
  name: 'Editorial',
  shortDefinition: 'Type-led, high-contrast hierarchy.',
  coreMood: 'Confident, curated',
  bestUseCase: 'Media and content brands',
  distinctiveSignals: ['Full-bleed imagery', 'Pull quotes'],
  notes: '',
  notionId: 'abc123',
  hasOverride: false,
};

const validBrief = {
  projectName: 'Brew & Bloom',
  industry: 'Coffee shop',
  posture: 'boutique' as const,
  description: 'A warm neighbourhood café celebrating local artisans.',
};

const validRecipe = {
  brief: validBrief,
  aesthetic: validTaxonomyEntry,
  layout: { ...validTaxonomyEntry, id: 'bento', bucket: 'layout' as const, name: 'Bento' },
};

const validRequest: IterationRequest = {
  recipe: validRecipe,
  previousHtml: '<html><body>Hello</body></html>',
  previousArtifactId: '20260505-120000-ab12',
  feedback: 'Make the hero section larger and bolder.',
};

// ---------------------------------------------------------------------------
// IterationRequestSchema — feedback bounds
// ---------------------------------------------------------------------------

describe('IterationRequestSchema — feedback bounds', () => {
  it('rejects feedback shorter than 10 chars', () => {
    // 9 chars
    expect(() =>
      IterationRequestSchema.parse({ ...validRequest, feedback: 'too short' }),
    ).toThrow();
  });

  it('rejects feedback longer than 1000 chars', () => {
    expect(() =>
      IterationRequestSchema.parse({ ...validRequest, feedback: 'a'.repeat(1001) }),
    ).toThrow();
  });

  it('accepts feedback of exactly 10 chars', () => {
    const result = IterationRequestSchema.parse({ ...validRequest, feedback: '1234567890' });
    expect(result.feedback).toBe('1234567890');
  });

  it('accepts feedback of exactly 1000 chars', () => {
    const feedback = 'a'.repeat(1000);
    const result = IterationRequestSchema.parse({ ...validRequest, feedback });
    expect(result.feedback).toBe(feedback);
  });
});

// ---------------------------------------------------------------------------
// IterationRequestSchema — full valid payload
// ---------------------------------------------------------------------------

describe('IterationRequestSchema — valid payloads', () => {
  it('parses a complete valid IterationRequest', () => {
    const result = IterationRequestSchema.parse(validRequest);
    expect(result.previousArtifactId).toBe(validRequest.previousArtifactId);
    expect(result.feedback).toBe(validRequest.feedback);
    expect(result.recipe.brief.projectName).toBe('Brew & Bloom');
  });

  it('parses a recipe with optional interaction and system fields', () => {
    const withOptionals = {
      ...validRequest,
      recipe: {
        ...validRecipe,
        interaction: {
          ...validTaxonomyEntry,
          id: 'hover',
          bucket: 'interaction' as const,
          name: 'Hover',
        },
        system: { ...validTaxonomyEntry, id: 'dark', bucket: 'system' as const, name: 'Dark' },
      },
    };
    const result = IterationRequestSchema.parse(withOptionals);
    expect(result.recipe.interaction?.id).toBe('hover');
    expect(result.recipe.system?.id).toBe('dark');
  });

  it('parses a recipe without optional interaction and system fields', () => {
    const result = IterationRequestSchema.parse(validRequest);
    expect(result.recipe.interaction).toBeUndefined();
    expect(result.recipe.system).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// IterationRequestSchema — Recipe shape validation
// ---------------------------------------------------------------------------

describe('IterationRequestSchema — recipe shape', () => {
  it('rejects a recipe missing the required aesthetic field', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { aesthetic: _omit, ...recipeWithoutAesthetic } = validRecipe;
    expect(() =>
      IterationRequestSchema.parse({ ...validRequest, recipe: recipeWithoutAesthetic }),
    ).toThrow();
  });

  it('rejects a recipe missing the required layout field', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { layout: _omit, ...recipeWithoutLayout } = validRecipe;
    expect(() =>
      IterationRequestSchema.parse({ ...validRequest, recipe: recipeWithoutLayout }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// IterationRequestSchema — other required fields
// ---------------------------------------------------------------------------

describe('IterationRequestSchema — other required fields', () => {
  it('accepts a request without previousHtml (Rule 1: server reads parent.htmlSource)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { previousHtml: _omit, ...withoutHtml } = validRequest;
    const result = IterationRequestSchema.parse(withoutHtml);
    expect(result.previousHtml).toBeUndefined();
    expect(result.previousArtifactId).toBe(validRequest.previousArtifactId);
  });

  it('accepts a request with previousHtml present (backward-compat for CLI)', () => {
    const result = IterationRequestSchema.parse(validRequest);
    expect(result.previousHtml).toBe(validRequest.previousHtml);
  });

  it('rejects an empty previousArtifactId', () => {
    expect(() =>
      IterationRequestSchema.parse({ ...validRequest, previousArtifactId: '' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// IterationRequestSchema — optional siteId + slug fields (Task 16)
// ---------------------------------------------------------------------------

describe('IterationRequestSchema — siteId + slug optional fields', () => {
  it('accepts a body WITH siteId and slug', () => {
    const result = IterationRequestSchema.parse({
      ...validRequest,
      siteId: 'site-deadbeef0001',
      slug: '/',
    });
    expect(result.siteId).toBe('site-deadbeef0001');
    expect(result.slug).toBe('/');
  });

  it('accepts a body WITHOUT siteId and slug (backward-compat)', () => {
    const result = IterationRequestSchema.parse(validRequest);
    expect(result.siteId).toBeUndefined();
    expect(result.slug).toBeUndefined();
  });

  it('accepts a body with siteId but no slug', () => {
    const result = IterationRequestSchema.parse({ ...validRequest, siteId: 'site-abc' });
    expect(result.siteId).toBe('site-abc');
    expect(result.slug).toBeUndefined();
  });

  it('accepts a body with slug but no siteId', () => {
    const result = IterationRequestSchema.parse({ ...validRequest, slug: '/about' });
    expect(result.slug).toBe('/about');
    expect(result.siteId).toBeUndefined();
  });

  it('still rejects a body missing the required recipe field', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { recipe: _omit, ...withoutRecipe } = validRequest;
    expect(() =>
      IterationRequestSchema.parse({ ...withoutRecipe, siteId: 'site-x', slug: '/' }),
    ).toThrow();
  });

  it('still rejects a body missing the required previousArtifactId field', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { previousArtifactId: _omit, ...withoutId } = validRequest;
    expect(() =>
      IterationRequestSchema.parse({ ...withoutId, siteId: 'site-x', slug: '/' }),
    ).toThrow();
  });

  it('still rejects feedback shorter than 10 chars even with siteId+slug present', () => {
    expect(() =>
      IterationRequestSchema.parse({
        ...validRequest,
        feedback: 'too short',
        siteId: 'site-x',
        slug: '/',
      }),
    ).toThrow();
  });
});
