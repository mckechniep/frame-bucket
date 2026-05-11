import type { AnthropicRequest } from './assembler';
import { loadRecommendationSystemPrompt } from './loader';
import { formatBrief, formatTaxonomySummary } from './recommendation/user-template';
import type { Brief } from '@/lib/types/recipe';
import type { Taxonomy } from '@/lib/types/taxonomy';

export async function assembleRecommendationRequest(
  brief: Brief,
  taxonomy: Taxonomy,
): Promise<AnthropicRequest> {
  const systemText = await loadRecommendationSystemPrompt();

  const userContent = `${formatBrief(brief)}\n\n${formatTaxonomySummary(taxonomy)}`;

  return {
    model: 'claude-haiku-4-5',
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: systemText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
    stream: false,
  };
}
