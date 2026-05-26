import type { Taxonomy } from '@/lib/types/taxonomy';
import { POSTURE_DEFINITIONS, type Brief } from '@/lib/types/recipe';

/**
 * Returns a condensed markdown summary of the taxonomy grouped by bucket.
 * Only includes summary fields (id, name, coreMood, distinctiveSignals, bestUseCase).
 * Does NOT include notes or other extended fields.
 */
export function formatTaxonomySummary(taxonomy: Taxonomy): string {
  const sections: string[] = [];

  function formatGroup(heading: string, entries: Taxonomy['aesthetics']): void {
    if (entries.length === 0) return;
    const bullets = entries.map(
      (e) =>
        `- **${e.name}** (${e.id}): ${e.coreMood}. Distinctive: ${e.distinctiveSignals.join(', ')}. Best for: ${e.bestUseCase}.`,
    );
    sections.push(`## ${heading}\n\n${bullets.join('\n')}`);
  }

  formatGroup('Aesthetics', taxonomy.aesthetics);
  formatGroup('Layouts', taxonomy.layouts);
  formatGroup('Interactions', taxonomy.interactions);
  formatGroup('Systems', taxonomy.systems);

  return sections.join('\n\n');
}

/**
 * Formats the project brief as a markdown bullet list for the recommendation user message.
 * Output format: `- **Key:** value` lines (markdown bold labels).
 * A sibling `formatBrief` in `../format-brief.ts` produces the same logical fields
 * as plain-text `Key: value` lines for the generation and iteration prompts.
 * If the `Brief` shape changes, update both functions together.
 */
export function formatBrief(brief: Brief): string {
  const posture =
    brief.posture === 'custom'
      ? brief.customPosture?.trim() || 'custom'
      : `${brief.posture} — ${POSTURE_DEFINITIONS[brief.posture].tagline}`;
  const colorLine = brief.colorsProvided?.length
    ? `- **Color hints:** ${brief.colorsProvided.join(', ')}`
    : '- **Color hints:** (none — you choose)';

  const lines = [
    '## Brief',
    '',
    `- **Project name:** ${brief.projectName}`,
    `- **Industry:** ${brief.industry}`,
    `- **Posture:** ${posture}`,
    colorLine,
    `- **Notes:** ${brief.description ?? '(none)'}`,
  ];

  return lines.join('\n');
}
