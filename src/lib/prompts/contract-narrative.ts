import type { DesignTokens } from '@/lib/contract/types';

/**
 * Maximum HTML source characters forwarded to the model.
 * Rule 9: cap the input size to prevent runaway token usage.
 */
const MAX_HTML_CHARS = 30_000;

/**
 * Serialize design tokens into a compact, model-readable representation.
 * Values are listed verbatim so the model can reference them accurately.
 * Rule 7: no value is invented or altered here — this is direct serialization.
 */
function serializeTokens(tokens: DesignTokens): string {
  const lines: string[] = [];

  lines.push('### Colors');
  if (tokens.colors.length === 0) {
    lines.push('(none)');
  } else {
    for (const c of tokens.colors) {
      const note = c.note ? ` — ${c.note}` : '';
      lines.push(`  ${c.name}: ${c.value}${note}`);
    }
  }

  lines.push('');
  lines.push('### Fonts');
  if (tokens.fonts.length === 0) {
    lines.push('(none)');
  } else {
    for (const f of tokens.fonts) {
      lines.push(`  ${f.family} | role: ${f.role} | weights: ${f.weights.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('### Type Scale');
  if (tokens.typeScale.length === 0) {
    lines.push('(none)');
  } else {
    for (const t of tokens.typeScale) {
      lines.push(`  ${t.name}: ${t.value}`);
    }
  }

  lines.push('');
  lines.push('### Spacing');
  if (tokens.spacing.length === 0) {
    lines.push('(none)');
  } else {
    for (const s of tokens.spacing) {
      lines.push(`  ${s.name}: ${s.value}`);
    }
  }

  lines.push('');
  lines.push('### Other tokens');
  if (tokens.other.length === 0) {
    lines.push('(none)');
  } else {
    for (const o of tokens.other) {
      lines.push(`  ${o.name}: ${o.value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the system and user prompt strings for the narrative LLM call.
 * Pure function — no IO, no client. Returns { system, user }.
 *
 * Rule 7: The system prompt enforces that the model DOCUMENTS the design
 * system from the supplied token values; it may NOT invent, alter, or
 * restate any token value as fact.
 */
export function buildNarrativePrompt(
  tokens: DesignTokens,
  htmlSource: string,
  recipeSummary: string,
): { system: string; user: string } {
  const system = `You are a design-system documentation specialist. Your role is to DOCUMENT an existing design system by writing clear, accurate prose about its identity, rules, component patterns, and extension guidance.

CRITICAL CONSTRAINT — Rule 7: You may NOT invent, alter, or restate any token value as fact. Every color, spacing, type-scale, and font value you reference must come verbatim from the token list provided by the user. You are describing and interpreting the design language implied by those values — not creating new ones.

Your output MUST contain exactly four markdown sections with these exact headings (in this order):

## Identity
A concise description of the visual identity, mood, and design language conveyed by these tokens.

## Rules
Numbered rules that govern how these tokens should be applied. Each rule must be grounded in the actual token values provided.

## Component Patterns
Guidance on how common UI components (navigation, hero, cards, buttons, etc.) should be constructed using these tokens. Reference specific token names where relevant.

## How to Extend
Instructions for extending this design system: how to add new components, introduce new tokens, or adapt the system for new contexts — while remaining faithful to the established design language.

Do not include any other top-level markdown headings. Do not fabricate token values. Write in clear, direct technical prose suitable for a developer reference document.`;

  const truncatedHtml = htmlSource.slice(0, MAX_HTML_CHARS);
  const tokenBlock = serializeTokens(tokens);

  // The four headings below are structural cues for the model — not parsed by this module.
  const user = `## Recipe / Site Summary
${recipeSummary || '(not provided)'}

## Extracted Design Tokens
${tokenBlock}

## HTML Source (first ${MAX_HTML_CHARS.toLocaleString()} characters)
\`\`\`html
${truncatedHtml}
\`\`\`

---

Using the design tokens above, write the four-section documentation. Produce exactly these sections in this order:

## Identity
## Rules
## Component Patterns
## How to Extend

Reference specific token names and their verbatim values when writing each section. Do not invent token values not listed above.`;

  return { system, user };
}
