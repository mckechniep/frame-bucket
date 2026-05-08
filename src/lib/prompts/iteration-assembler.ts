import type { IterationRequest } from '@/lib/types';
import type { Recipe, Brief } from '@/lib/types/recipe';
import type { AnthropicRequest, SystemBlock } from './assembler';
import { loadCanonLayers } from './canon-layers';

const ITERATION_DIRECTIVE =
  'Regenerate the full HTML, applying the feedback while preserving everything that works. ' +
  'Output the complete new HTML document, beginning with `<!DOCTYPE html>` and ending with `</html>`. ' +
  'No markdown fences, no commentary.';

function formatBrief(brief: Brief): string {
  const vibe = brief.vibe === 'custom' ? (brief.customVibe ?? 'custom') : brief.vibe;
  return [
    `Project name: ${brief.projectName}`,
    `Industry: ${brief.industry}`,
    `Vibe: ${vibe}`,
    brief.colorsProvided?.length
      ? `Color hints: ${brief.colorsProvided.join(', ')}`
      : 'Color hints: (none — you choose palette that serves the recipe)',
    brief.description ? `Notes: ${brief.description}` : 'Notes: (none)',
  ].join('\n');
}

function formatRecipeSummary(recipe: Recipe): string {
  const parts = [
    `aesthetic=${recipe.aesthetic.id} (${recipe.aesthetic.name})`,
    `layout=${recipe.layout.id} (${recipe.layout.name})`,
  ];
  if (recipe.interaction) {
    parts.push(`interaction=${recipe.interaction.id} (${recipe.interaction.name})`);
  }
  if (recipe.system) {
    parts.push(`system=${recipe.system.id} (${recipe.system.name})`);
  }
  return parts.join(', ');
}

export async function assembleIterationRequest(
  request: IterationRequest,
): Promise<AnthropicRequest> {
  const { recipe, previousHtml, feedback } = request;
  const layers = await loadCanonLayers(recipe);

  const system: SystemBlock[] = [
    {
      type: 'text',
      text: 'You are a senior frontend designer iterating on a previously-generated HTML file. The user has provided feedback; apply it while preserving everything that works.',
    },
    {
      type: 'text',
      text: `## Frontend Design Posture\n\n${layers.posture}\n\n## Craft Canon\n\n${layers.baseCanon}\n\n## Generation Output Contract\n\n${layers.outputContract}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (layers.override) {
    system.push({
      type: 'text',
      text: `## Aesthetic Override — ${recipe.aesthetic.name}\n\n${layers.override}`,
      cache_control: { type: 'ephemeral' },
    });
  }

  const userContent = [
    `Original brief: ${formatBrief(recipe.brief)}`,
    `Original recipe: ${formatRecipeSummary(recipe)}`,
    '',
    'Previous HTML:',
    '```html',
    previousHtml,
    '```',
    '',
    'User feedback to apply:',
    `> ${feedback}`,
    '',
    ITERATION_DIRECTIVE,
  ].join('\n');

  return {
    model: 'claude-opus-4-7',
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content: userContent }],
    stream: true,
  };
}
