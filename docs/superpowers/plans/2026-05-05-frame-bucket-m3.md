# Frame Bucket — M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two AI-powered capabilities that turn Frame Bucket from a hardcoded-recipe generator into something usable: (1) **recommendation engine** — given a project brief, Haiku ranks aesthetics/layouts and returns reasoned picks; (2) **iteration loop** — given a previous generation, the user submits free-text feedback and Opus regenerates the page applying that feedback. Together these are the unblockers that let M2's 80%-canon ship as a real product, with iteration covering the last 20%.

**Architecture deltas from M2:** Three new server endpoints (`/api/recommend`, `/api/iterate`), one new prompt assembler (recommendation), one extension to the existing assembler (iteration mode), one extension to the archive (parent linking), and a UI extension on `/generate-test` to support iteration rounds. No new dependencies. Cache strategy: recommendation reuses the canon as cached system prompt; iteration reuses the canon + override as cached system, with previous HTML and feedback as fresh user content.

**Tech Stack:** No additions. Reuses everything from M0–M2.

**Related spec:** `docs/superpowers/specs/2026-04-14-frame-bucket-design.md`

**Scope boundary:** This plan covers M3 only. M4 (full wizard UI with localStorage persistence), M5 (rich preview/iterate UI), M6 (remaining 18 aesthetic overrides), M7 (polish), and M8 (deploy) follow.

---

## File Structure Map

Only new and modified files shown — everything else from M0–M2 is unchanged.

```
frame-bucket/
├── docs/
│   └── superpowers/
│       └── plans/
│           └── 2026-05-05-frame-bucket-m3.md     — this file
│
├── src/
│   ├── lib/
│   │   ├── types/
│   │   │   ├── recommendation.ts                 — NEW: Brief, RecommendationResult, RankedPick
│   │   │   ├── iteration.ts                      — NEW: IterationRequest, IterationArtifact
│   │   │   └── index.ts                          — re-export new types
│   │   ├── schemas/
│   │   │   ├── recommendation.ts                 — NEW: Zod schemas for recommendation I/O
│   │   │   └── iteration.ts                      — NEW: Zod schemas for iteration I/O
│   │   ├── prompts/
│   │   │   ├── recommendation/
│   │   │   │   ├── system.md                     — NEW: Haiku recommendation system prompt
│   │   │   │   └── user-template.ts              — NEW: brief + taxonomy → user message
│   │   │   ├── recommendation-assembler.ts       — NEW
│   │   │   ├── iteration-assembler.ts            — NEW: extends generation with previous HTML + feedback
│   │   │   └── __tests__/
│   │   │       ├── recommendation-assembler.test.ts
│   │   │       └── iteration-assembler.test.ts
│   │   ├── recommendation/
│   │   │   ├── parse.ts                          — NEW: parse Haiku JSON output, validate via Zod
│   │   │   └── __tests__/
│   │   │       └── parse.test.ts
│   │   ├── generation/
│   │   │   └── archive.ts                        — MODIFIED: add parent_artifact_id, iteration_round
│   │   └── anthropic/
│   │       └── client.ts                         — MODIFIED if needed: confirm Haiku model id support
│   │
│   ├── app/
│   │   ├── api/
│   │   │   ├── recommend/
│   │   │   │   └── route.ts                      — NEW: POST /api/recommend
│   │   │   └── iterate/
│   │   │       └── route.ts                      — NEW: POST /api/iterate (streaming)
│   │   ├── generate-test/
│   │   │   ├── _form.tsx                         — MODIFIED: add iteration UI
│   │   │   ├── _stream-view.tsx                  — MODIFIED: render Refine textarea + history
│   │   │   └── _refine-panel.tsx                 — NEW: free-text feedback input + submit
│   │   └── recommend-test/
│   │       ├── page.tsx                          — NEW: brief input → recommendation results
│   │       └── _form.tsx                         — NEW
│   │
│   └── ...
│
├── scripts/
│   ├── recommend.ts                              — NEW: CLI playground for recommendation
│   └── iterate.ts                                — NEW: CLI playground for iteration
│
└── tmp/
    └── generations/                              — extended: subdirs may now have parent_id in meta.json
```

---

## Cost & Cache Strategy

| Operation      | Model            | Input tokens                                                                    | Output tokens           | Cache hit rate                            | Estimated cost |
| -------------- | ---------------- | ------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------- | -------------- |
| Recommendation | claude-haiku-4-5 | ~3K (canon-lite + taxonomy summary) + ~500 (brief)                              | ~1K (ranked picks JSON) | System ~80% cached after first call       | ~$0.005        |
| Iteration      | claude-opus-4-7  | ~10K (canon + override, cached) + ~22K (previous HTML, fresh) + ~200 (feedback) | ~22K (full regen)       | System cached; previous HTML always fresh | ~$2.00         |

**Cache structure for iteration:**

1. System block 1: base canon + output contract (cached)
2. System block 2: aesthetic override (cached)
3. User message: brief + previous HTML + feedback (fresh per iteration)

The previous HTML is always fresh because it changes each iteration. Trying to cache it in a system block would invalidate the cache every iteration anyway, so it stays in the user message. ~$2 per iteration is the cost floor; cap at 3 rounds per session to keep total user spend bounded at ~$6 per project.

**Recommendation cost is negligible** (~$0.005/call). Free to call eagerly when the user is composing a brief.

---

## Phase 3a — Recommendation Engine (Tasks 1–7)

The recommender takes a project brief (name, industry, vibe, free-text description) and returns a ranked list of aesthetic + layout picks with one-sentence reasoning per pick. It runs on Haiku because the task is taxonomy-bounded — the model picks from a fixed set of 22 aesthetics × 17 layouts based on tag-like signals (mood, industry fit, distinctive signals from the taxonomy entries). No code generation, no design judgment.

The output is structured: top-3 aesthetic picks, top-3 layout picks, optional interaction + system suggestions, with confidence scores and reasoning. The user can accept the top pick, switch to a runner-up, or override entirely.

### Task 1 — Recommendation types

- [ ] **Goal:** Define `Brief`, `RankedPick`, `RecommendationResult` types in `src/lib/types/recommendation.ts`.

- [ ] **Files:**
  - **NEW** `src/lib/types/recommendation.ts`
  - **MODIFIED** `src/lib/types/index.ts` (re-export)

- [ ] **Implementation notes:**
  - `Brief` has same shape as the test harness brief in `_form.tsx` (`projectName`, `industry`, `vibe`, `description`). Vibe is `'mom-and-pop' | 'scrappy-startup' | 'enterprise' | 'custom'`.
  - `RankedPick` is `{ entryId: string; entryName: string; confidence: number; reasoning: string }` where confidence is 0–1.
  - `RecommendationResult` groups picks by bucket: `{ aesthetics: RankedPick[]; layouts: RankedPick[]; interactions?: RankedPick[]; systems?: RankedPick[]; generatedAt: string; model: string }`.
  - Interaction and system buckets are optional in v1 — recommendation is a 2-bucket call by default, with the optional buckets returning empty arrays unless the brief signals the need.

- [ ] **Tests:** None — types only.

- [ ] **Acceptance:** TypeScript compiles, types are exported, no runtime behavior.

- [ ] **Commit:** `feat(types): add recommendation types (Brief, RankedPick, RecommendationResult)`

### Task 2 — Recommendation Zod schemas

- [ ] **Goal:** Validation schemas for the brief input and the recommendation output (the JSON Haiku will return).

- [ ] **Files:**
  - **NEW** `src/lib/schemas/recommendation.ts`

- [ ] **Implementation notes:**
  - `BriefSchema` mirrors the `Brief` type — `projectName: string min(1)`, `industry: string min(1)`, `vibe: enum(...)`, `description: string min(10)`.
  - `RankedPickSchema` — `entryId: string min(1)`, `entryName: string min(1)`, `confidence: number min(0).max(1)`, `reasoning: string min(10).max(300)`.
  - `RecommendationResultSchema` — composition of the above with arrays bounded (top 3 per bucket, max 5 to absorb model variance).
  - Export `inferred` types via `z.infer` so consumers can use either the explicit type or the schema-inferred one (they should be structurally identical — write a type-level test that confirms).

- [ ] **Tests:** `__tests__/recommendation.test.ts`
  - Valid brief parses
  - Brief with empty `projectName` fails
  - Brief with description shorter than 10 chars fails
  - Valid recommendation result parses
  - Recommendation result with confidence > 1 fails
  - Recommendation result with empty reasoning fails

- [ ] **Acceptance:** All 6+ test cases pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(schemas): add recommendation Zod schemas with bound test cases`

### Task 3 — Recommendation system prompt

- [ ] **Goal:** Author the markdown system prompt that primes Haiku to act as a senior design lead picking from the taxonomy. This is the persistent, cached part of the recommendation prompt.

- [ ] **Files:**
  - **NEW** `src/lib/prompts/recommendation/system.md`

- [ ] **Implementation notes:**
  - Open with role: "You are a senior design lead at a studio. You receive a project brief and recommend buckets from a known taxonomy."
  - Specify the 4 buckets and what each means. Don't repeat the full taxonomy entries — the user message will include those — but explain the _roles_ of each bucket.
  - Specify the output format: a JSON object matching `RecommendationResultSchema`. The model returns top-3 aesthetics and top-3 layouts always; interactions and systems only when the brief explicitly calls for interaction (data viz, e-commerce, dashboard) or system context (large product, design system).
  - Specify ranking discipline: confidence is 0–1; top pick should be ≥ 0.65 if any pick fits; if no aesthetic clearly fits the brief, return three with low confidence (≤ 0.5) rather than forcing a high-confidence pick.
  - Specify reasoning discipline: 1–2 sentences max per pick. Reference the brief's industry, mood, or audience — not the taxonomy entry's own description. Bad: "Editorial is a magazine-style aesthetic." Good: "The family-bakery brief leans on personal narrative and considered typography over functional clarity, which Editorial expresses with serif display + photography."
  - Specify what NOT to do: no tied scores, no "all options work", no markdown commentary outside the JSON. Output starts with `{` and ends with `}`.

- [ ] **Tests:** None — prose authoring.

- [ ] **Acceptance:** File renders cleanly in markdown preview; covers role, output schema, ranking discipline, reasoning discipline.

- [ ] **Commit:** `content(prompts): add recommendation system prompt for Haiku`

### Task 4 — Recommendation user-message template

- [ ] **Goal:** Build the per-request user message: brief + condensed taxonomy summary (entry id, name, mood, distinctive signals — NOT the full canon override).

- [ ] **Files:**
  - **NEW** `src/lib/prompts/recommendation/user-template.ts`
  - **NEW** `src/lib/prompts/recommendation-assembler.ts`

- [ ] **Implementation notes:**
  - `formatTaxonomySummary(taxonomy: Taxonomy): string` returns markdown with each entry as `- **{name}** ({id}): {coreMood}. Distinctive: {distinctiveSignals.join(', ')}. Best for: {bestUseCase}.` Group by bucket.
  - `formatBrief(brief: Brief): string` returns markdown formatted brief.
  - `assembleRecommendationRequest(brief: Brief, taxonomy: Taxonomy): AnthropicRequest` returns a request matching the existing assembler's shape: model = `claude-haiku-4-5`, system = [{ text: <system.md>, cache_control: ephemeral }], messages = [{ role: 'user', content: <brief + taxonomy summary> }], max_tokens = 4000 (recommendation output is small).
  - The system block is cached; the user message is fresh per request. Cache hit rate for the system should approach 100% after the first request of the day.

- [ ] **Tests:** `src/lib/prompts/__tests__/recommendation-assembler.test.ts`
  - Assembled request has correct model id
  - System block is cached (`cache_control` present)
  - User message contains all bucket entries from the input taxonomy
  - User message does NOT contain the full notes / canon override (only summary fields)
  - max_tokens is bounded (≤ 4000)

- [ ] **Acceptance:** Tests pass; manual inspection of an assembled request matches the system.md format.

- [ ] **Commit:** `feat(prompts): add recommendation request assembler with cached system + summarised taxonomy`

### Task 5 — Recommendation parser

- [ ] **Goal:** Parse Haiku's JSON response, validate it via Zod, and resolve `entryId` references back to full `TaxonomyEntry` objects via the taxonomy store.

- [ ] **Files:**
  - **NEW** `src/lib/recommendation/parse.ts`

- [ ] **Implementation notes:**
  - `parseRecommendationResponse(rawText: string, taxonomy: Taxonomy): RecommendationResult` — strips any leading/trailing whitespace, parses JSON, validates via `RecommendationResultSchema`, then enriches each pick by resolving `entryId` against the taxonomy.
  - Returns `{ ...result, picks: [{ entry: TaxonomyEntry, confidence, reasoning }] }` — the resolved structure that downstream code consumes.
  - Throws `RecommendationParseError` (a named error class) with the raw text in `cause` if parsing or validation fails. The route handler converts this to a 502 Bad Gateway.
  - Handles the common Haiku failure mode of wrapping JSON in markdown fences (` ```json ... ``` `) — strip those before parsing.
  - Handles the case where Haiku invents an `entryId` that isn't in the taxonomy — drop that pick with a logged warning, don't throw.

- [ ] **Tests:** `__tests__/parse.test.ts`
  - Valid JSON parses and resolves entries
  - JSON wrapped in ` ```json ... ``` ` fences is stripped and parses
  - Malformed JSON throws `RecommendationParseError`
  - JSON failing schema validation throws `RecommendationParseError`
  - Invented `entryId` is dropped (not thrown), with the rest of the result preserved
  - Empty array of picks is acceptable (low-confidence "no match" case)

- [ ] **Acceptance:** All 6+ test cases pass.

- [ ] **Commit:** `feat(recommendation): add response parser with markdown-fence handling and entry resolution`

### Task 6 — `/api/recommend` route

- [ ] **Goal:** POST endpoint that accepts a Brief, calls Haiku, returns a parsed RecommendationResult.

- [ ] **Files:**
  - **NEW** `src/app/api/recommend/route.ts`

- [ ] **Implementation notes:**
  - `runtime = 'nodejs'`, `maxDuration = 30` (Haiku is fast).
  - POST handler:
    1. Parse body, validate via `BriefSchema`. 400 on invalid.
    2. Load taxonomy via `defaultFileStore().get()`. 503 if no cache.
    3. Assemble request via `assembleRecommendationRequest`.
    4. Call `client.messages.create(...)` (non-streaming — recommendation output is small enough that streaming adds complexity without UX benefit).
    5. Pull the text content from the response.
    6. Parse via `parseRecommendationResponse`.
    7. Return `{ recommendation, usage, cost }` JSON.
  - Use the existing `getAnthropicClient()` singleton.
  - Use the existing `estimateCost` for cost reporting (extend its model table to include `claude-haiku-4-5` if not already there).
  - Wire `req.signal` into the SDK call (same kill-switch pattern as `/api/generate`) so client disconnects abort the call.

- [ ] **Tests:** None at the route level (these would be Next.js integration tests). Unit-test coverage from Tasks 2 and 5 is the layer.

- [ ] **Acceptance:** Hitting the route with a valid brief returns a 200 with a recommendation JSON. Invalid brief returns 400. Missing taxonomy returns 503.

- [ ] **Commit:** `feat(api): add /api/recommend route (Haiku-powered, non-streaming)`

### Task 7 — Recommendation playground script + test page

- [ ] **Goal:** Two ways to exercise the recommender: a CLI playground (`pnpm recommend`) and a minimal `/recommend-test` page that shows the picks.

- [ ] **Files:**
  - **NEW** `scripts/recommend.ts`
  - **NEW** `src/app/recommend-test/page.tsx`
  - **NEW** `src/app/recommend-test/_form.tsx`

- [ ] **Implementation notes:**
  - CLI script mirrors `scripts/gen.ts` structure: load .env, dynamic-import the assembler, send a hardcoded brief, log the result. Take optional CLI args for `--brief-file <path>` and `--vibe <vibe>`.
  - `/recommend-test` page is a server component that loads the taxonomy and passes it to a client form component.
  - `_form.tsx` is identical-shape to the existing `/generate-test/_form.tsx` (project name, industry, vibe, description) plus a "Recommend" button that calls `/api/recommend` and renders the result as a table of picks per bucket with confidence bars and reasoning.

- [ ] **Tests:** None — playground harness.

- [ ] **Acceptance:**
  - `pnpm recommend` produces a recommendation with reasoning for the Maple St Bakery brief.
  - `/recommend-test` page renders the form, fires a recommendation, displays results.
  - Confidence values appear in the 0–1 range.
  - Reasoning is brief-specific (not generic taxonomy descriptions).

- [ ] **Commit:** `feat(recommend): add CLI playground and /recommend-test page`

---

## Phase 3b — Iteration Loop (Tasks 8–13)

Iteration takes a previous generation + user feedback and regenerates the page. The mechanics: same canon and override (cached), new user message that includes the previous HTML and the feedback. Output is a new full HTML document, archived as a child of the original artifact.

The iteration UX in v1 is intentionally minimal — extend `/generate-test` with a Refine textarea that appears after a generation completes, and a button to send the round. M4's wizard will wrap this into a richer flow, but the API and the underlying generation should be production-shaped from the start.

### Task 8 — Iteration types + schemas

- [ ] **Goal:** Define types for the iteration request, the chained artifact, and the cost guardrail state.

- [ ] **Files:**
  - **NEW** `src/lib/types/iteration.ts`
  - **NEW** `src/lib/schemas/iteration.ts`
  - **MODIFIED** `src/lib/types/index.ts`

- [ ] **Implementation notes:**
  - `IterationRequest`: `{ recipe: Recipe; previousHtml: string; previousArtifactId: string; feedback: string }`. Feedback is bounded — min 10 chars, max 1000 chars (force concision; longer feedback usually means "regenerate from scratch" rather than iterate).
  - `IterationArtifact`: extends `GenerationArtifact` with `parentArtifactId: string` and `iterationRound: number` (round = 0 for original, 1+ for iterations). The archive's existing `recipeSummary` field should include `(iter N)` when round > 0.
  - Zod schemas mirror.

- [ ] **Tests:** `src/lib/schemas/__tests__/iteration.test.ts`
  - Feedback < 10 chars fails
  - Feedback > 1000 chars fails
  - Valid IterationRequest parses
  - Recipe shape is the same as in generate (reuse RecipeSchema)

- [ ] **Acceptance:** Tests pass.

- [ ] **Commit:** `feat(types): add iteration types + schemas with bounded feedback`

### Task 9 — Iteration prompt assembler

- [ ] **Goal:** Build the assembler that produces the Anthropic request for an iteration. Reuses the canon + override caching from generate, but the user message contains the previous HTML and the feedback.

- [ ] **Files:**
  - **NEW** `src/lib/prompts/iteration-assembler.ts`
  - **MODIFIED** `src/lib/prompts/assembler.ts` (factor shared code out)

- [ ] **Implementation notes:**
  - Reuse `loadBaseCanon`, `loadOutputContract`, `loadAestheticOverride` from the existing assembler — these become a shared `loadCanonLayers(recipe)` helper.
  - System blocks: same two-layer cache as generate (canon+contract cached, aesthetic override cached separately). No change.
  - User message is the only difference. Format:

    ````
    Original brief: ...
    Original recipe: aesthetic=X (full name), layout=Y (full name), ...

    Previous HTML:
    ```html
    <previous html>
    ````

    User feedback to apply:

    > <feedback>

    Regenerate the full HTML, applying the feedback while preserving everything that works. Output the complete new HTML document, beginning with `<!DOCTYPE html>` and ending with `</html>`. No markdown fences, no commentary.

    ```

    ```

  - The `<previous html>` block uses literal triple-backticks; embed the HTML verbatim. Anthropic's API handles backticks in user messages without issues.
  - Keep `max_tokens: 32000` (same as iteration).
  - Stream the response (same as generate).
  - Return shape: `{ model, max_tokens, system, messages, stream: true }`.

- [ ] **Tests:** `src/lib/prompts/__tests__/iteration-assembler.test.ts`
  - System blocks have correct cache_control flags (matching generate)
  - User message contains the previous HTML
  - User message contains the feedback
  - User message contains the recipe summary
  - max_tokens is 32000

- [ ] **Acceptance:** Tests pass. Refactor of `assembler.ts` doesn't break existing generate tests.

- [ ] **Commit:** `feat(prompts): add iteration assembler reusing canon cache + previous-HTML user message`

### Task 10 — Archive parent linking

- [ ] **Goal:** Extend the archive store so iteration artifacts know their parent and round number.

- [ ] **Files:**
  - **MODIFIED** `src/lib/generation/archive.ts`

- [ ] **Implementation notes:**
  - Extend `GenerationArtifact` (the on-disk `meta.json` shape) with `parentArtifactId?: string` and `iterationRound: number` (default 0).
  - Archive store `save()` accepts the new fields; `get(id)` returns them; add `getChildren(id)` that lists artifacts where `parentArtifactId === id`.
  - Migration: existing `meta.json` files without these fields are treated as `iterationRound: 0, parentArtifactId: undefined`. No file rewriting on read.
  - `recipeSummary` for iterations: append `(iter ${round})` when round > 0.

- [ ] **Tests:** Update `src/lib/generation/__tests__/archive.test.ts`
  - Existing meta.json without parent fields still loads
  - Saving with parent fields persists them
  - getChildren returns chained artifacts in iteration-round order
  - getChildren returns empty array when no children exist

- [ ] **Acceptance:** Tests pass; existing archived gens (from M2 validation) still load without errors.

- [ ] **Commit:** `feat(archive): add parent_artifact_id and iteration_round with backward-compatible read`

### Task 11 — `/api/iterate` route

- [ ] **Goal:** POST endpoint that accepts an IterationRequest, streams the regenerated HTML, archives it as a child artifact.

- [ ] **Files:**
  - **NEW** `src/app/api/iterate/route.ts`

- [ ] **Implementation notes:**
  - Mirror the existing `/api/generate/route.ts` exactly. Same SSE shape (`delta`, `images_started`, `images_done`, `done`, `error`), same client-disconnect kill switch (`req.signal` → SDK), same image injection post-processing, same archive on success.
  - The differences:
    1. Validate body via `IterationRequestSchema` (not `RecipeSchema`).
    2. Assemble via `assembleIterationRequest` (not the generation assembler).
    3. On archive save, set `parentArtifactId` and `iterationRound` (= parent's round + 1; load the parent's meta to determine).
  - Same `max_tokens: 32000`, same `maxDuration: 300`, same `runtime: 'nodejs'`.
  - Error handling: AbortError on disconnect → return without archiving. Validation errors → 400. Missing parent artifact → 404.
  - Cost guardrail: if the parent's chain length is already 3+, return 429 with body `{ error: 'iteration limit reached', limit: 3 }`. The client handles UX for this; the server is the source of truth.

- [ ] **Tests:** None at route level (relies on assembler + archive tests).

- [ ] **Acceptance:**
  - Valid iteration request streams an SSE response identical in shape to /api/generate
  - The resulting archived artifact has the correct parent + round
  - Hitting iterate when parent already has round 3 child returns 429
  - Disconnect mid-stream cancels cleanly without saving an archive

- [ ] **Commit:** `feat(api): add /api/iterate streaming route with parent linking and 3-round cap`

### Task 12 — Iteration UI on /generate-test

- [ ] **Goal:** Extend `/generate-test` so that after a generation completes, the user sees a Refine panel with a textarea and a submit button. Submitting triggers an iteration round inline.

- [ ] **Files:**
  - **MODIFIED** `src/app/generate-test/_form.tsx`
  - **MODIFIED** `src/app/generate-test/_stream-view.tsx`
  - **NEW** `src/app/generate-test/_refine-panel.tsx`

- [ ] **Implementation notes:**
  - State: track an array of `Generation | Iteration` objects, each with its own SSE state. The latest one is the "active" view; previous rounds are collapsible.
  - When a generation completes (`onDone`), show the Refine panel beneath the preview. Textarea + submit button. Disabled while streaming. Disabled when round count = 3.
  - Submitting Refine fires `/api/iterate` with the previous artifact's id + previous HTML + feedback. The streaming view appends a new round below the current one.
  - **Critical**: maintain the same kill-switch pattern from `/generate-test` for iteration — `useCallback([], [])` for the submit handler, `AbortController` cleanup, button disabled while streaming. The same $45 fuckup applies here, doubly so because iteration also burns Opus tokens.
  - Display the iteration round count (e.g., "Iteration 2 of 3 max").
  - When the 429 (rate limit) comes back, surface a clear "Iteration limit reached for this generation. Start a fresh generation to continue." message.

- [ ] **Tests:** None — UI changes verified manually.

- [ ] **Acceptance:**
  - After a generation, the Refine textarea appears.
  - Submitting feedback fires an iteration and streams the new HTML.
  - History of all rounds is visible (at least the most recent + a "previous rounds" disclosure).
  - At round 3, the submit button is disabled and a clear message explains why.
  - Stream cancellation works on browser disconnect (verify by hard-reload during streaming — confirm server logs show abort).

- [ ] **Commit:** `feat(generate-test): add Refine panel for iteration rounds with kill-switch parity`

### Task 13 — Iteration playground script

- [ ] **Goal:** CLI script that runs an iteration round against a previously archived generation. Useful for fast iteration on the iteration prompt itself without going through the UI.

- [ ] **Files:**
  - **NEW** `scripts/iterate.ts`

- [ ] **Implementation notes:**
  - Usage: `pnpm iterate <archive-id> "<feedback>"`.
  - Loads the archive, the previous HTML, the recipe (from meta.json — extend meta.json to persist the recipe id pair if it doesn't already).
  - Calls iteration assembler, fires the Anthropic stream, archives the result with parent linking.
  - Mirrors `scripts/gen.ts` structure.

- [ ] **Tests:** None.

- [ ] **Acceptance:** `pnpm iterate <id> "fix the recipe steps wrapping bug"` produces a child artifact with `parentArtifactId === <id>`, `iterationRound === parent.round + 1`.

- [ ] **Commit:** `feat(scripts): add iterate.ts CLI playground for iteration rounds`

---

## Phase 3c — Validation Gate (Tasks 14–15)

Same shape as M2's validation gate: run a small set of canonical exercises that stress-test the M3 capabilities end-to-end. Findings either pass M3 or surface required fixes.

### Task 14 — Recommendation validation

- [ ] **Goal:** Verify the recommender produces sensible picks across diverse briefs.

- [ ] **Files:** No code — this is a runtime exercise. Findings get committed to a markdown file under `docs/superpowers/validations/`.

- [ ] **Procedure:** Run `pnpm recommend` against three briefs covering different industries and moods. For each, capture the top-3 aesthetic + layout picks with reasoning, and judge whether the picks are defensible. Two of three should produce a clear top pick (≥ 0.65 confidence, on-brief reasoning); the third should produce a low-confidence "no clear match" result. Briefs:
  1. **Maple St Bakery** (food & beverage, mom-and-pop, family-run) — expect Editorial or similar magazine-leaning aesthetic.
  2. **Northpoint Dental** (healthcare, enterprise, modern professional) — expect Corporate Clean or Swiss.
  3. **Hex Records** (music label, scrappy-startup, underground/zine) — expect Brutalist or similar high-contrast aesthetic.

- [ ] **Acceptance:**
  - Each brief produces a recommendation in < 5 seconds.
  - Top pick is defensible for all 3 briefs (subjective check).
  - Reasoning references the brief's specifics, not generic taxonomy descriptions.
  - At least one runner-up is also defensible per brief (i.e., the recommender isn't tunnel-visioned).
  - No JSON parse errors, no schema validation failures.
  - Cost per call < $0.01.

- [ ] **Commit:** `docs(validation): record M3 recommendation gate findings`

### Task 15 — Iteration validation

- [ ] **Goal:** Verify iteration meaningfully improves a known-bad generation.

- [ ] **Files:** No code; findings to validation md.

- [ ] **Procedure:** Take one of the M2 Editorial validation gens with known issues (the recipe-steps grid bug is the cleanest test case). Run `pnpm iterate <id> "the recipe steps text is wrapping at one word per line — fix the layout"` and compare the result to the parent. Then run a second-round iteration with a stylistic feedback like "make the hero feel warmer, less institutional" and verify the structural fix from round 1 is preserved while the stylistic shift lands.

- [ ] **Acceptance:**
  - Round 1 fixes the recipe-steps bug (manually verify the rendered HTML; the `<small>` should no longer be in the 1.2rem column).
  - Round 1 doesn't regress unrelated parts (hero, family section, etc. should be visually similar to parent).
  - Round 2 lands the stylistic feedback (warmer color palette, softer typography, etc.) while keeping round 1's structural fix.
  - Round 3 is reachable (cost guardrail not triggered).
  - Round 4 hits the 429 limit cleanly.
  - Each iteration costs ~$2 ± $0.50, completes in < 4 minutes.

- [ ] **Commit:** `docs(validation): record M3 iteration gate findings`

---

## Risks & Mitigations

| Risk                                                                                   | Tier   | Mitigation                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Iteration regenerates the whole page; could regress unrelated parts the user liked** | High   | Display a side-by-side or rounds-list view in the UI so the user can revert to a previous round if iteration regressed something. Also document: "iteration is whole-page; if you want to keep something exactly, mention it in the feedback."                              |
| **Recommendation hallucinates entryIds not in the taxonomy**                           | Medium | Parser drops invalid IDs with a logged warning rather than throwing — partial result is better than no result. If all picks for a bucket are invalid, return empty array for that bucket and let the user pick manually.                                                    |
| **Iteration cost spirals if the user runs many rounds**                                | Medium | Hard cap at 3 rounds per parent artifact, enforced server-side. UI displays remaining rounds. M4 may relax this with explicit "spend $X more?" confirmation.                                                                                                                |
| **Haiku JSON output occasionally truncates or malforms**                               | Low    | Strip markdown fences before parse; clear error class with raw text in `cause` for debugging; max_tokens of 4000 is well above expected output (~1K).                                                                                                                       |
| **Previous HTML in iteration message is large (~22K tokens), dominating input cost**   | Low    | Already accepted: ~$2 per iteration is the floor. If the user reports cost concerns, M4+ can offer "diff-only iteration" where the model is asked to return a patch instead of full HTML — but that's a different prompt and a different parser, deferred.                  |
| **The runaway-fetch class of bug repeats in iteration UI**                             | High   | Task 12's acceptance criteria explicitly require the same kill-switch parity (useCallback, AbortController, server signal wiring). Don't ship Task 12 without verifying the audit applies. The `feedback_billable_streams.md` memory should be re-read before implementing. |

---

## Out of Scope (Deferred to M4+)

- **Wizard UI**: M4 will compose the recommend → review picks → manual override → generate flow into a polished step-by-step wizard. M3 ships with the test pages only.
- **localStorage state persistence**: M4 wires up Zustand + localStorage for cross-session state. M3 is in-memory only.
- **Recommendation reasoning UI polish**: M3 displays the JSON-shaped reasoning as a list. M4 styles it (confidence bars, ranked-pick cards, "swap to runner-up" CTA).
- **Per-section iteration**: "Only fix the hero" is currently impossible — iteration regenerates the whole page. A surgical-edit mode would require a different prompt strategy and a different output parser. Deferred until user demand surfaces.
- **Iteration history visualization**: M3 shows previous rounds in a collapsed list. M4 may add a versioned tree view, diffs between rounds, "checkpoint" naming.
- **Cross-recipe iteration**: "Generate Editorial, then iterate to make it more Brutalist" is currently impossible (iteration locks to the original recipe). Switching aesthetics is a fresh generation. Deferred.
- **Streaming recommendation**: Recommendation output is small (~1K tokens, < 5s); streaming is unnecessary complexity. Deferred unless validation reveals UX issue.

---

## Build Order Summary

| Tasks | Phase                      | Outcome                                                                                                                      |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1–7   | 3a — Recommendation engine | Haiku-powered `/api/recommend` works end-to-end; `/recommend-test` page surfaces it; CLI playground for fast iteration       |
| 8–13  | 3b — Iteration loop        | Opus-powered `/api/iterate` works end-to-end; `/generate-test` Refine panel; archive linking; CLI playground; cost guardrail |
| 14–15 | 3c — Validation            | Recommendation produces defensible picks across 3 briefs; iteration meaningfully fixes known bugs without regression         |

**Estimated total cost of validation runs:** Recommendation ~$0.05 (3 × $0.01-ish), iteration ~$8 (3 rounds × $2 + buffer). Total M3 validation budget: ~$8.

**Estimated implementation time** (subagent-driven, with two-stage review): ~6 hours of agent time.

When all 15 tasks land green and validation gates pass, M3 is done. M4 (full wizard) follows.
