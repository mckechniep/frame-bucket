import { describe, it, expect } from 'vitest';
import { estimateCost, formatUsd } from '../cost';

describe('estimateCost', () => {
  it('computes Opus cost with cache reads (current model)', () => {
    const cost = estimateCost({
      model: 'claude-opus-4-7',
      inputTokens: 1000,
      cacheReadTokens: 40000,
      outputTokens: 2000,
    });
    // 1000*15/1e6 + 40000*1.5/1e6 + 2000*75/1e6 = 0.225
    expect(cost).toBeCloseTo(0.225, 3);
  });

  it('computes Opus cost (legacy 4-5 model)', () => {
    const cost = estimateCost({
      model: 'claude-opus-4-5',
      inputTokens: 1000,
      cacheReadTokens: 40000,
      outputTokens: 2000,
    });
    expect(cost).toBeCloseTo(0.225, 3);
  });

  it('computes Haiku cost without cache', () => {
    const cost = estimateCost({
      model: 'claude-haiku-4-5',
      inputTokens: 10000,
      cacheReadTokens: 0,
      outputTokens: 500,
    });
    expect(cost).toBeCloseTo(0.0125, 4);
  });

  it('returns 0 for unknown model', () => {
    const cost = estimateCost({
      model: 'claude-mystery-9-9',
      inputTokens: 1000,
      cacheReadTokens: 0,
      outputTokens: 100,
    });
    expect(cost).toBe(0);
  });

  it('includes 1.25× cache-write surcharge when cacheCreationTokens is provided', () => {
    // Sonnet: inputPerMTok=3, cacheWritePerMTok=3.75, outputPerMTok=15
    // 10000*3/1e6 + 8000*3.75/1e6 + 0*0.3/1e6 + 2000*15/1e6
    // = 0.03 + 0.03 + 0 + 0.03 = 0.09
    const cost = estimateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000,
      cacheCreationTokens: 8000,
      cacheReadTokens: 0,
      outputTokens: 2000,
    });
    expect(cost).toBeCloseTo(0.09, 6);
  });

  it('treats absent cacheCreationTokens as 0 (backward compat)', () => {
    // Same call as above but without cacheCreationTokens → should differ by
    // exactly the write surcharge: 8000*3.75/1e6 = 0.03
    const withWrite = estimateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000,
      cacheCreationTokens: 8000,
      cacheReadTokens: 0,
      outputTokens: 2000,
    });
    const withoutWrite = estimateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000,
      cacheReadTokens: 0,
      outputTokens: 2000,
    });
    expect(withWrite - withoutWrite).toBeCloseTo((8000 * 3.75) / 1_000_000, 9);
  });

  it('treats explicit cacheCreationTokens: undefined as 0', () => {
    const cost = estimateCost({
      model: 'claude-haiku-4-5',
      inputTokens: 10000,
      cacheCreationTokens: undefined,
      cacheReadTokens: 0,
      outputTokens: 500,
    });
    // Same as the no-write Haiku test: 0.0125
    expect(cost).toBeCloseTo(0.0125, 4);
  });
});

describe('formatUsd', () => {
  it('shows <$0.01 for tiny amounts', () => {
    expect(formatUsd(0.005)).toBe('<$0.01');
  });

  it('formats with 2 decimal places', () => {
    expect(formatUsd(2.345)).toBe('$2.35');
    expect(formatUsd(0.5)).toBe('$0.50');
  });
});
