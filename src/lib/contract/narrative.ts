import { getAnthropicClient } from '@/lib/anthropic/client';
import { estimateCost } from '@/lib/cost';
import { buildNarrativePrompt } from '@/lib/prompts/contract-narrative';
import type { ContractNarrative, DesignTokens } from './types';

export const NARRATIVE_MODEL = 'claude-haiku-4-5';
export const NARRATIVE_MAX_TOKENS = 2048;

// Neutralize fenced code blocks so heading-like lines inside examples
// (e.g. a "## Identity" snippet in How-to-Extend) can't trigger a false section split.
function maskCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (block) => block.replace(/^##\s.*$/gm, '<!-- masked -->'));
}

/**
 * Parse the four narrative sections out of the model's response text.
 * Exported for unit testing.
 *
 * Sections can appear in any order. A missing section yields an empty string.
 * Prose under each heading is trimmed.
 */
export function parseNarrativeSections(text: string): ContractNarrative {
  // Build a regex that splits on any of the four known headings.
  // We capture the heading itself so we know which field to populate.
  const headingPattern = /^(## (?:Identity|Rules|Component Patterns|How to Extend))\s*$/m;

  const result: ContractNarrative = {
    identity: '',
    rules: '',
    componentPatterns: '',
    howToExtend: '',
  };

  if (!text.trim()) return result;

  // Neutralize heading-like lines inside fenced code blocks before splitting,
  // so a "## Identity" example snippet in How-to-Extend can't corrupt parsing.
  const masked = maskCodeFences(text);

  // Split into chunks; odd indices are headings, even indices are content after.
  const parts = masked.split(headingPattern);
  // parts[0] = text before first heading (discard)
  // parts[1] = first heading, parts[2] = content after first heading, etc.

  for (let i = 1; i < parts.length - 1; i += 2) {
    const heading = (parts[i] ?? '').trim();
    const content = (parts[i + 1] ?? '').trim();

    switch (heading) {
      case '## Identity':
        result.identity = content;
        break;
      case '## Rules':
        result.rules = content;
        break;
      case '## Component Patterns':
        result.componentPatterns = content;
        break;
      case '## How to Extend':
        result.howToExtend = content;
        break;
      default:
        break;
    }
  }

  return result;
}

const EMPTY_NARRATIVE: ContractNarrative = {
  identity: '',
  rules: '',
  componentPatterns: '',
  howToExtend: '',
};

/**
 * Generate the prose narrative for a design contract via a single capped
 * Haiku call. Non-streaming, hard-timeout, never throws.
 *
 * Rule 9 discipline:
 *   - max_tokens capped at NARRATIVE_MAX_TOKENS (2048)
 *   - Hard AbortSignal.timeout(30s) — the call cannot run away
 *   - maxRetries: 0 — no SDK retry loops that extend billing past the timeout
 *     (max_tokens cap + 30s hard timeout + no retries = call cannot run away
 *     or exceed its budget; see Rule 9 / billable-stream discipline)
 *   - Any failure → silent fallback (empty narrative), cost 0
 *   - The caller (Task 8) renders a tokens-only contract when narrative is empty
 */
export async function generateNarrative(
  tokens: DesignTokens,
  htmlSource: string,
  recipeSummary: string,
): Promise<{ narrative: ContractNarrative; modelId: string; cost: number }> {
  const { system, user } = buildNarrativePrompt(tokens, htmlSource, recipeSummary);

  try {
    const response = await getAnthropicClient().messages.create(
      {
        model: NARRATIVE_MODEL,
        max_tokens: NARRATIVE_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      },
      { signal: AbortSignal.timeout(30_000), maxRetries: 0 },
    );

    // Extract the first text block from the response content array.
    // The SDK's ContentBlock union includes TextBlock, ThinkingBlock, etc.
    // We narrow by checking type === 'text' and then read .text safely.
    const textBlock = response.content.find((block) => block.type === 'text');

    if (!textBlock || !('text' in textBlock)) {
      // No text block in the response — degrade gracefully
      console.error('[contract-narrative] failed', new Error('No text block in response'));
      return { narrative: { ...EMPTY_NARRATIVE }, modelId: NARRATIVE_MODEL, cost: 0 };
    }

    const narrative = parseNarrativeSections(textBlock.text);

    const cost = estimateCost({
      model: NARRATIVE_MODEL,
      inputTokens: response.usage.input_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      outputTokens: response.usage.output_tokens,
    });

    return { narrative, modelId: NARRATIVE_MODEL, cost };
  } catch (err: unknown) {
    console.error('[contract-narrative] failed', err);
    return { narrative: { ...EMPTY_NARRATIVE }, modelId: NARRATIVE_MODEL, cost: 0 };
  }
}
