import { describe, expect, it } from 'vitest';

import {
  applyModelConfig,
  DEFAULT_MODEL_SETTINGS,
  EFFORT_BUDGETS,
  type StageSetting,
} from '../constants';

const base = {
  model: 'claude-opus-4-7',
  max_tokens: 32000,
  system: [],
  messages: [],
  stream: true,
};

describe('applyModelConfig', () => {
  it('returns the base request unchanged when no config is provided', () => {
    expect(applyModelConfig(base, undefined)).toBe(base);
  });

  it('overrides the model and enables no thinking for effort=off', () => {
    const out = applyModelConfig(base, { model: 'claude-opus-4-8', effort: 'off' });
    expect(out.model).toBe('claude-opus-4-8');
    expect(out.max_tokens).toBe(32000);
    expect(out.thinking).toBeUndefined();
  });

  it('enables thinking and bumps max_tokens above the budget for non-off effort', () => {
    const out = applyModelConfig(base, { model: 'claude-opus-4-8', effort: 'high' });
    expect(out.model).toBe('claude-opus-4-8');
    expect(out.thinking).toEqual({ type: 'enabled', budget_tokens: EFFORT_BUDGETS.high });
    expect(out.max_tokens).toBe(32000 + EFFORT_BUDGETS.high);
    // Anthropic requires max_tokens > thinking.budget_tokens.
    expect(out.max_tokens).toBeGreaterThan(out.thinking!.budget_tokens);
  });

  it('scales the thinking budget with effort level', () => {
    const low = applyModelConfig(base, { model: base.model, effort: 'low' });
    const medium = applyModelConfig(base, { model: base.model, effort: 'medium' });
    const high = applyModelConfig(base, { model: base.model, effort: 'high' });
    expect(low.thinking!.budget_tokens).toBeLessThan(medium.thinking!.budget_tokens);
    expect(medium.thinking!.budget_tokens).toBeLessThan(high.thinking!.budget_tokens);
  });

  it('does not mutate the base request', () => {
    const snapshot = { ...base };
    applyModelConfig(base, { model: 'claude-opus-4-8', effort: 'medium' } satisfies StageSetting);
    expect(base).toEqual(snapshot);
  });

  it('defaults preserve prior behavior (opus-4-7 generate, haiku recommend, all effort off)', () => {
    expect(DEFAULT_MODEL_SETTINGS.generate).toEqual({ model: 'claude-opus-4-7', effort: 'off' });
    expect(DEFAULT_MODEL_SETTINGS.recommend.model).toBe('claude-haiku-4-5');
    expect(Object.values(DEFAULT_MODEL_SETTINGS).every((s) => s.effort === 'off')).toBe(true);
  });
});
