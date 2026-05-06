import type { Recipe, TaxonomyEntry } from '@/lib/types';
import { loadPosture, loadBaseCanon, loadOutputContract, loadAestheticOverride } from './loader';

interface SystemBlock {
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
  const [posture, baseCanon, outputContract] = await Promise.all([
    loadPosture(),
    loadBaseCanon(),
    loadOutputContract(),
  ]);
  const override = recipe.aesthetic.hasOverride
    ? await loadAestheticOverride(recipe.aesthetic.id)
    : null;

  const system: SystemBlock[] = [
    {
      type: 'text',
      text: 'You are a senior frontend designer producing one self-contained HTML file that meets the craft canon, the output contract, and the recipe.',
    },
    {
      type: 'text',
      text: `## Frontend Design Posture\n\n${posture}\n\n## Craft Canon\n\n${baseCanon}\n\n## Generation Output Contract\n\n${outputContract}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (override) {
    system.push({
      type: 'text',
      text: `## Aesthetic Override — ${recipe.aesthetic.name}\n\n${override}`,
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
