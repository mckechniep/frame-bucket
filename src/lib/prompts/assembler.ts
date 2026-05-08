import type { Recipe, TaxonomyEntry } from '@/lib/types';
import { loadCanonLayers } from './canon-layers';

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system: SystemBlock[];
  messages: Array<{ role: 'user'; content: string }>;
  stream: boolean;
}

function formatEntry(e: TaxonomyEntry): string {
  return [
    `- Name: ${e.name}`,
    `- Bucket: ${e.bucket}`,
    `- Short Definition: ${e.shortDefinition}`,
    `- Core Mood: ${e.coreMood}`,
    `- Best Use Case: ${e.bestUseCase}`,
    `- Distinctive Signals: ${e.distinctiveSignals.join('; ')}`,
    `- Notes: ${e.notes || '(none)'}`,
  ].join('\n');
}

/**
 * Formats the project brief as plain text for the generation user message.
 * Output format: unadorned `Key: value` lines (no markdown bold).
 * A sibling `formatBrief` in `recommendation/user-template.ts` produces the
 * same logical fields with markdown-bold labels for the recommendation prompt.
 * If the `Brief` shape changes, update both functions together.
 */
function formatBrief(brief: Recipe['brief']): string {
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

function formatRecipe(recipe: Recipe): string {
  const parts = [
    '## Brief',
    formatBrief(recipe.brief),
    '',
    '## Aesthetic',
    formatEntry(recipe.aesthetic),
    '',
    '## Layout',
    formatEntry(recipe.layout),
  ];
  if (recipe.interaction) {
    parts.push('', '## Interaction', formatEntry(recipe.interaction));
  } else {
    parts.push('', '## Interaction', '(skipped — no explicit interaction pattern)');
  }
  if (recipe.system) {
    parts.push('', '## System Language', formatEntry(recipe.system));
  } else {
    parts.push('', '## System Language', '(skipped — no explicit system framework)');
  }
  return parts.join('\n');
}

const GENERATION_DIRECTIVE = `Produce one complete, self-contained HTML file for this recipe.
Apply the craft canon rigorously. Apply the aesthetic override if present.
Obey the output contract strictly.
Output ONLY the file. No commentary, no markdown fences, no explanations.`;

export async function assembleGenerationRequest(recipe: Recipe): Promise<AnthropicRequest> {
  const layers = await loadCanonLayers(recipe);

  const system: SystemBlock[] = [
    {
      type: 'text',
      text: 'You are a senior frontend designer producing one self-contained HTML file that meets the craft canon, the output contract, and the recipe.',
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

  const userContent = `${formatRecipe(recipe)}\n\n---\n\n${GENERATION_DIRECTIVE}`;

  return {
    model: 'claude-opus-4-7',
    // 32K covers verbose aesthetics (Editorial, Maximalist) without over-paying
    // for compact ones. Hit during M2 validation: 16K truncated mid-document.
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content: userContent }],
    stream: true,
  };
}
