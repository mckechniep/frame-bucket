import type { Recipe } from '@/lib/types';

/**
 * Formats a project brief as plain text for inclusion in user messages.
 * Used by both the generation assembler and iteration assembler.
 *
 * Output format: unadorned `Key: value` lines.
 *
 * NOTE: A separate markdown-bold formatter exists in `recommendation/user-template.ts`
 * for the recommendation prompt. The two diverge intentionally — the recommendation
 * targets markdown rendering in the user-message structure, while generation/iteration
 * uses plain text. If the Brief shape changes, update both functions.
 */
export function formatBrief(brief: Recipe['brief']): string {
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
