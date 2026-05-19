import { describe, expect, test } from 'vitest';

import type { Brief, Recipe, TaxonomyEntry } from '@/lib/types';

import {
  canEnterStep,
  firstAllowedStep,
  nextStep,
  prevStep,
  STEPS,
  stepPath,
  type Step,
} from '@/lib/wizard/steps';

const briefFixture: Brief = {
  projectName: 'Acme',
  industry: 'cafe',
  vibe: 'mom-and-pop',
  description: 'A cafe site.',
};

const aestheticFixture: TaxonomyEntry = {
  id: 'a',
  bucket: 'aesthetic',
  name: 'Warm',
  shortDefinition: '',
  coreMood: '',
  bestUseCase: '',
  distinctiveSignals: [],
  notes: '',
  notionId: '',
  hasOverride: false,
};

const recipeFixture: Recipe = {
  brief: briefFixture,
  aesthetic: aestheticFixture,
  layout: { ...aestheticFixture, id: 'l', bucket: 'layout', name: 'Editorial' },
};

const empty = { brief: null, recommendation: null, selectedRecipe: null };

describe('STEPS constant', () => {
  test('lists brief, recommend, generate in order', () => {
    expect(STEPS).toEqual(['brief', 'recommend', 'generate']);
  });
});

describe('stepPath', () => {
  test('maps each step to /wizard/<step>', () => {
    expect(stepPath('brief')).toBe('/wizard/brief');
    expect(stepPath('recommend')).toBe('/wizard/recommend');
    expect(stepPath('generate')).toBe('/wizard/generate');
  });
});

describe('prevStep / nextStep', () => {
  test('prevStep returns the prior step or null at the start', () => {
    expect(prevStep('brief')).toBeNull();
    expect(prevStep('recommend')).toBe('brief');
    expect(prevStep('generate')).toBe('recommend');
  });

  test('nextStep returns the next step or null at the end', () => {
    expect(nextStep('brief')).toBe('recommend');
    expect(nextStep('recommend')).toBe('generate');
    expect(nextStep('generate')).toBeNull();
  });
});

describe('canEnterStep', () => {
  test('brief is always enterable', () => {
    expect(canEnterStep('brief', empty)).toBe(true);
    expect(canEnterStep('brief', { ...empty, brief: briefFixture })).toBe(true);
  });

  test('recommend requires brief', () => {
    expect(canEnterStep('recommend', empty)).toBe(false);
    expect(canEnterStep('recommend', { ...empty, brief: briefFixture })).toBe(true);
  });

  test('generate requires brief and selectedRecipe', () => {
    expect(canEnterStep('generate', empty)).toBe(false);
    expect(canEnterStep('generate', { ...empty, brief: briefFixture })).toBe(false);
    expect(
      canEnterStep('generate', { ...empty, brief: briefFixture, selectedRecipe: recipeFixture }),
    ).toBe(true);
  });
});

describe('firstAllowedStep', () => {
  test('empty state → brief', () => {
    expect(firstAllowedStep(empty)).toBe<Step>('brief');
  });

  test('brief set → recommend', () => {
    expect(firstAllowedStep({ ...empty, brief: briefFixture })).toBe<Step>('recommend');
  });

  test('brief + selectedRecipe set → generate', () => {
    expect(
      firstAllowedStep({ ...empty, brief: briefFixture, selectedRecipe: recipeFixture }),
    ).toBe<Step>('generate');
  });
});
