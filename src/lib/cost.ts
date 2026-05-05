// Anthropic pricing per 1M tokens (USD). Cache-read prices are typically 10%
// of base input price. Adjust when Anthropic announces new pricing.
// Both legacy (4-5) and current (4-6/4-7) IDs are listed for compatibility
// with synced taxonomies and the assembler's pinned model ID.

interface Pricing {
  inputPerMTok: number;
  cacheReadPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, Pricing> = {
  // Current generation
  'claude-opus-4-7': { inputPerMTok: 15, cacheReadPerMTok: 1.5, outputPerMTok: 75 },
  'claude-sonnet-4-6': { inputPerMTok: 3, cacheReadPerMTok: 0.3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, cacheReadPerMTok: 0.1, outputPerMTok: 5 },

  // Legacy / synonyms
  'claude-opus-4-5': { inputPerMTok: 15, cacheReadPerMTok: 1.5, outputPerMTok: 75 },
  'claude-sonnet-4-5': { inputPerMTok: 3, cacheReadPerMTok: 0.3, outputPerMTok: 15 },
};

export interface UsageBreakdown {
  model: string;
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

export function estimateCost(usage: UsageBreakdown): number {
  const p = PRICING[usage.model];
  if (!p) return 0;
  return (
    (usage.inputTokens * p.inputPerMTok) / 1_000_000 +
    (usage.cacheReadTokens * p.cacheReadPerMTok) / 1_000_000 +
    (usage.outputTokens * p.outputPerMTok) / 1_000_000
  );
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}
