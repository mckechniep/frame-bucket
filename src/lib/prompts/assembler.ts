import type { Recipe, TaxonomyEntry } from '@/lib/types';
import { loadCanonLayers, formatInvariantBlock } from './canon-layers';
import { formatBrief } from './format-brief';

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
Output ONLY the file. No commentary, no markdown fences, no explanations.
Include a site navigation element appropriate to your design (it may be visually minimal). Wrap ONLY the navigation link anchors — not the surrounding <nav> or container — in these exact HTML comment markers:
<!-- fb:nav-links:start -->
<a href="/">...</a>
<!-- fb:nav-links:end -->
This page is currently the only page of its site, so render a single link with href="/" labeled with the project/site name. Do not omit these markers.`;

export async function assembleGenerationRequest(recipe: Recipe): Promise<AnthropicRequest> {
  const layers = await loadCanonLayers(recipe);

  const system: SystemBlock[] = [
    {
      type: 'text',
      text: 'You are a senior frontend designer producing one self-contained HTML file that meets the craft canon, the output contract, and the recipe.',
    },
    {
      type: 'text',
      text: formatInvariantBlock(layers),
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
