/**
 * Runtime-configurable model + effort settings for the four billable Anthropic
 * stages. Client-safe: this module is pure data + one pure function (no fs, no
 * server-only imports), so the admin panel can import the option lists directly.
 *
 * The store (file/db) and the API route live in sibling modules; this file is
 * the single source of truth for what the options ARE and how an effort level
 * translates into an extended-thinking budget.
 */

export type Stage = 'recommend' | 'generate' | 'iterate' | 'subpage';

export type Effort = 'off' | 'low' | 'medium' | 'high';

export interface StageSetting {
  model: string;
  effort: Effort;
}

export type ModelSettings = Record<Stage, StageSetting>;

/** Anthropic extended-thinking parameter shape (the "effort" lever). */
export type ThinkingConfig = { type: 'enabled'; budget_tokens: number };

export const STAGES: readonly { id: Stage; label: string; hint: string }[] = [
  { id: 'recommend', label: 'Recommend', hint: 'Picks recipe options from the taxonomy' },
  { id: 'generate', label: 'Generate', hint: 'Produces the landing-page HTML' },
  { id: 'iterate', label: 'Iterate (Refine)', hint: 'Applies refine feedback' },
  { id: 'subpage', label: 'Add page', hint: 'Generates a matching subpage' },
] as const;

/**
 * Curated model list. Newest / most capable first. Restricting the picker to
 * known-good IDs prevents a typo from breaking generation at call time.
 * Opus 4.8 is the current flagship and the recommended choice for generation.
 */
export const MODEL_OPTIONS = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8 — latest, most capable' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-5', label: 'Opus 4.5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — fast, low cost' },
] as const;

export const MODEL_IDS = MODEL_OPTIONS.map((m) => m.id) as readonly string[];

export const EFFORT_OPTIONS: readonly { id: Effort; label: string }[] = [
  { id: 'off', label: 'Off — no extended thinking' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
] as const;

/**
 * Effort → extended-thinking token budget. `off` disables thinking entirely
 * (today's behavior). Budgets are conservative so that `base max_tokens +
 * budget` stays comfortably within model output limits when streaming.
 */
export const EFFORT_BUDGETS: Record<Effort, number> = {
  off: 0,
  low: 4000,
  medium: 8000,
  high: 16000,
};

/**
 * Defaults mirror the values previously hardcoded in the assemblers, so
 * behavior is unchanged until an operator edits the settings in /admin.
 */
export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  recommend: { model: 'claude-haiku-4-5', effort: 'off' },
  generate: { model: 'claude-opus-4-7', effort: 'off' },
  iterate: { model: 'claude-opus-4-7', effort: 'off' },
  subpage: { model: 'claude-opus-4-7', effort: 'off' },
};

/**
 * Applies a stage's model + effort to an assembled request. Pure and generic so
 * it never imports the prompt layer (avoids a settings⇄prompts cycle).
 *
 * - Overrides the model.
 * - For a non-`off` effort, enables extended thinking and ADDS the budget on top
 *   of the base `max_tokens` — Anthropic requires `max_tokens > budget_tokens`,
 *   and adding (rather than carving out) preserves the visible-output allowance.
 *   Thinking tokens bill as output, so existing cost tracking captures them.
 */
export function applyModelConfig<T extends { model: string; max_tokens: number }>(
  base: T,
  config: StageSetting | undefined,
): T & { thinking?: ThinkingConfig } {
  if (!config) return base;
  const budget = EFFORT_BUDGETS[config.effort] ?? 0;
  if (budget <= 0) {
    return { ...base, model: config.model };
  }
  return {
    ...base,
    model: config.model,
    max_tokens: base.max_tokens + budget,
    thinking: { type: 'enabled', budget_tokens: budget },
  };
}
