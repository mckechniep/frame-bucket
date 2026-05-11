# Frame Bucket — M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the consumer-facing wizard UI that stitches the M3 pipeline into a single coherent flow — brief intake → recommendation → generation → iteration — with cross-session state persistence and the full iteration history UI (tree view, side-by-side comparison, checkpoint naming). Replaces the test pages (`/generate-test`, `/recommend-test`) as the primary surface; the test pages stay around as prompt-iteration tools but are no longer the demo path.

**Architecture deltas from M3:** No new product features in the pipeline itself — M4 is entirely UI + state. A new `/wizard/[step]` route tree handles step navigation. A Zustand store (`@/lib/wizard/store`) holds brief, recommendation result, selected recipe, the iteration chain, and user-named checkpoints; the store is wrapped in Zustand's `persist` middleware backed by `localStorage`. Iteration UI moves out of `/generate-test` and into the wizard, with a new tree-view sidebar and a side-by-side comparison view. The Refine panel is extracted to a shared component.

**Tech Stack:** No additions. Tailwind v4 components rolled in-repo (per the design decision to avoid a component-library dependency). Zustand 5 is already a dependency; only the `persist` middleware import is new.

**Related spec:** `docs/superpowers/specs/2026-04-14-frame-bucket-design.md`

**Scope boundary:** This plan covers M4 only. M5 (any remaining preview/share polish — public artifact URLs, export-to-static, embed codes), M6 (remaining 18 aesthetic overrides), M7 (polish — accessibility audit, performance pass, dark/light parity sweep), M8 (deploy) follow. Auth, billing, rate-limiting, error tracking, and public-facing concerns are explicitly **out of scope** — M4 is internal/demo only.

---

## File Structure Map

Only new and modified files shown. Everything else from M0–M3 unchanged.

```
frame-bucket/
├── docs/
│   └── superpowers/
│       └── plans/
│           └── 2026-05-10-frame-bucket-m4.md       — this file
│
├── src/
│   ├── lib/
│   │   └── wizard/
│   │       ├── store.ts                            — NEW: Zustand store + persist
│   │       ├── persistence.ts                      — NEW: localStorage shape + migration helpers
│   │       ├── steps.ts                            — NEW: step enum + ordering + URL helpers
│   │       └── __tests__/
│   │           ├── store.test.ts
│   │           ├── persistence.test.ts
│   │           └── steps.test.ts
│   │
│   ├── app/
│   │   └── wizard/
│   │       ├── layout.tsx                          — NEW: shell with progress bar + back/next chrome
│   │       ├── [step]/
│   │       │   └── page.tsx                        — MODIFIED: dispatch to step component
│   │       ├── _components/
│   │       │   ├── progress-bar.tsx                — NEW
│   │       │   ├── step-brief.tsx                  — NEW
│   │       │   ├── step-recommend.tsx              — NEW
│   │       │   ├── step-generate.tsx               — NEW
│   │       │   ├── ranked-pick-card.tsx            — NEW
│   │       │   ├── recipe-summary.tsx              — NEW
│   │       │   ├── refine-panel.tsx                — NEW (extracted from /generate-test)
│   │       │   ├── iteration-history.tsx           — NEW: tree view
│   │       │   ├── side-by-side-preview.tsx        — NEW: two iframes for round comparison
│   │       │   └── checkpoint-name-modal.tsx       — NEW
│   │       └── _hooks/
│   │           └── use-wizard-router.ts            — NEW: step→URL navigation
│   │
│   └── (no other modifications)
│
└── (no other modifications)
```

`/generate-test` and `/recommend-test` are kept as-is. They remain useful for prompt iteration without the wizard's persistent state getting in the way. The plan's last task adds links from the wizard's "advanced" affordance and from `/admin` so they're discoverable.

---

## Cost & Cache Strategy

M4 has zero net new API spend. Every API call already exists from M3 (`/api/recommend`, `/api/generate`, `/api/iterate`). The wizard is a thin shell over them. The only cost surface is that wizard users might generate or iterate more freely because the UI lowers friction — that's a feature, and the existing per-iteration cost budget ($2/round, 3 rounds capped) still applies.

Cache hits remain governed by the existing assemblers — system blocks are cached, fresh per-request data flows through user messages.

---

## Avoiding Token Bombs and Double-Billing — Cross-Cutting Rules

Two failure modes from M3 must not be reintroduced in M4. These are non-negotiable for every task that touches an API call.

### Rule 1 — The client never sends HTML to `/api/iterate`

M3 surfaced that iterating against a parent with injected images can blow the 1M context window because the post-injection HTML is multi-MB. Fixed by storing `htmlSource` (the model's pre-injection output) in the archive and having `/api/iterate` prefer `parent.htmlSource ?? request.previousHtml`.

That fix is sufficient against accidental misuse, but the wizard makes it cheap to forget: a refresh-then-iterate flow could pull the post-injection HTML out of an iframe and ship it back to the server, even though the server already has the right version on disk. The fix: **drop `previousHtml` from the wire entirely**. The server is the source of truth.

Concretely:

- `IterationRequest.previousHtml` becomes optional in the type and Zod schema.
- The route always reads `parent.htmlSource` (existing fallback unchanged for legacy archives without `htmlSource`).
- The wizard's iterate call body is `{ recipe, previousArtifactId, feedback }` — no HTML.
- `iterate.ts` CLI keeps `parent.htmlSource` lookup as-is (no behavior change).
- `/generate-test`'s legacy stream-view passes only the artifact id once Task 9 (Refine panel extraction) refactors it through the same shared helper.

Task 9 is the natural home for this schema/route tightening since the Refine panel is the wizard's only call site and the change unblocks it.

### Rule 2 — Mounting a step must not fire the same API call twice

React 18+ StrictMode runs every `useEffect` setup twice in development to surface side-effect bugs. The streaming routes (`/api/generate`, `/api/iterate`) and the non-streaming `/api/recommend` are all easy to accidentally double-fire from a step component's mount effect — and even though the existing kill-switch aborts the first call server-side before tokens are consumed, the request still goes out, network bandwidth is wasted, and reasoning about which response "wins" gets confusing.

The required pattern in any step component that fires an API call on mount:

```tsx
useEffect(
  () => {
    // 1. Bail early if state already satisfies what we'd be fetching.
    if (alreadyHaveTheResult(state)) return;

    // 2. AbortController owns the request; cleanup aborts.
    const ac = new AbortController();
    let cancelled = false;

    fetchAndStream(args, { signal: ac.signal })
      .then((result) => {
        if (cancelled) return; // late-arriving result, store gone
        writeToStore(result);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (cancelled) return;
        surfaceError(err);
      });

    return () => {
      cancelled = true;
      ac.abort(); // server-side kill-switch trips here
    };
  },
  [
    /* stable deps only — primitive ids and feedback strings, NEVER objects */
  ],
);
```

Three things matter:

1. **The early-return store check** prevents the second StrictMode invocation from refiring at all, when the first succeeded fast enough to populate state. This is the common path in production where StrictMode is off — but it also covers the case where someone navigates back to a step and the state is already there.
2. **The AbortController cleanup** is what protects against StrictMode-style double-mounts and against actual user navigation away. The M3 kill-switch wiring (`req.signal` → SDK) makes this server-side cheap — aborted requests don't pay for Opus tokens.
3. **Effect dependencies must be primitives** (artifact id strings, feedback strings) and **NOT** object references like `recipe` or `brief` from the store. Object refs change on every store update and cause infinite refire loops.

This pattern is required in: Task 6 (`step-recommend.tsx`), Task 8 (`step-generate.tsx`), Task 9 (`refine-panel.tsx`). Each task's acceptance criteria explicitly require a StrictMode double-mount check.

### Validation

The Task 15 gate must include:

- Open `/wizard/brief`, enter a brief, advance, and watch the Network panel — exactly one `/api/recommend` request fires (not two).
- On the generate step, exactly one `/api/generate` request fires.
- Each Refine round fires exactly one `/api/iterate` request.
- Inspect any `/api/iterate` request body: `previousHtml` is absent or empty. Body is small (< 2 KB).
- Server logs (or terminal output of the dev server) show zero `AbortError`-and-retry pairs during a normal flow. Aborts only show up when the user navigates away mid-stream.

---

## State Model

The Zustand store backs all cross-step state. Shape:

```ts
interface WizardState {
  brief: Brief | null;
  recommendation: RecommendationResult | null;
  selectedRecipe: Recipe | null;
  rounds: Array<{
    artifactId: string;
    parentArtifactId: string | null;
    iterationRound: number;
    recipeSummary: string;
    cost: number;
    generatedAt: string;
    checkpointName?: string;
  }>;
  activeArtifactId: string | null;
  compareWithArtifactId: string | null; // for side-by-side
}
```

`rounds` is a flat array — the tree is reconstructed at render time from `parentArtifactId` references. Sticking to a flat array keeps persistence simple and avoids serialising graphs.

`activeArtifactId` is the one shown in the main preview pane. `compareWithArtifactId` is the optional second pane for side-by-side.

`checkpointName` is the user-given label per round (e.g. "warm palette landed here"). Empty when not set.

Persisted via Zustand's `persist` middleware, keyed at `frame-bucket-wizard@1` so future schema bumps can migrate cleanly. **HTML content is NOT persisted** — only artifact IDs. The preview iframes hit the server (`/api/artifact/<id>`, or load via the existing archive store) to fetch HTML.

---

## URL & Step Model

Three steps, deep-linkable:

| URL                 | Step | What lives here                                                                                        |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| `/wizard/brief`     | 1    | Brief form                                                                                             |
| `/wizard/recommend` | 2    | Recommendation results, pick/swap/override, click to advance                                           |
| `/wizard/generate`  | 3    | Streaming generation, Refine panel, iteration history sidebar, side-by-side preview, checkpoint naming |

Step-guard logic redirects forward/back when state is missing (e.g. hitting `/wizard/recommend` with no brief in store → redirect to `/wizard/brief`). Already-visited steps are reachable; future steps are not.

The existing `/wizard/[step]/page.tsx` stub dispatches by step parameter to the right step component. Stepping back is always allowed; stepping forward requires the prior step's output.

---

## Phase 4a — Wizard Shell + State (Tasks 1–4)

Foundation work. After 4a, the wizard renders empty step pages with persistent state plumbing in place; the steps themselves come in 4b–4d.

### Task 1 — Zustand store + persistence skeleton

- [ ] **Goal:** Create `@/lib/wizard/store.ts` with the full state shape, persisted to localStorage via Zustand's `persist` middleware.

- [ ] **Files:**
  - **NEW** `src/lib/wizard/store.ts`
  - **NEW** `src/lib/wizard/persistence.ts` — localStorage adapter + schema version helpers
  - **NEW** `src/lib/wizard/__tests__/store.test.ts`
  - **NEW** `src/lib/wizard/__tests__/persistence.test.ts`

- [ ] **Implementation notes:**
  - Store API: `useWizardStore` (the hook), `getWizardState` (for non-React reads), and named actions: `setBrief`, `setRecommendation`, `setSelectedRecipe`, `appendRound`, `setActiveArtifactId`, `setCompareWithArtifactId`, `setCheckpointName`, `reset`.
  - Persist key: `frame-bucket-wizard@1`. Migration stub: on version mismatch, drop persisted state and start fresh — better than half-restored state for v1.
  - Use `partialize` to keep `compareWithArtifactId` out of persistence (transient UI state).
  - SSR-safe: wrap localStorage access in a check; Zustand persist already handles this if you set `storage: createJSONStorage(() => localStorage)`.

- [ ] **Tests:**
  - Default state is empty (no brief, no rounds, etc.).
  - Setting brief then reading it round-trips.
  - `appendRound` adds in order and preserves parent linkage.
  - `setCheckpointName` updates the named round without touching others.
  - `reset` clears everything.
  - Persistence: write to localStorage, instantiate a fresh store, verify state restored.
  - Schema-version mismatch: write state under key `frame-bucket-wizard@0`, verify v1 store starts fresh and does not load the stale data.

- [ ] **Acceptance:** All tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(wizard): add Zustand store with localStorage persistence and migration guard`

### Task 2 — Step enum + URL routing helpers

- [ ] **Goal:** Single source of truth for step ordering, names, URLs, and step-guard logic (where can the user go from where).

- [ ] **Files:**
  - **NEW** `src/lib/wizard/steps.ts`
  - **NEW** `src/lib/wizard/__tests__/steps.test.ts`

- [ ] **Implementation notes:**
  - Export `STEPS = ['brief', 'recommend', 'generate'] as const`. Type `Step = (typeof STEPS)[number]`.
  - `stepPath(step: Step): string` → `/wizard/${step}`.
  - `prevStep(step: Step): Step | null` and `nextStep(step: Step): Step | null`.
  - `canEnterStep(step: Step, state: Pick<WizardState, 'brief' | 'recommendation' | 'selectedRecipe'>): boolean` — returns whether the prerequisites for that step are present.
  - `firstAllowedStep(state): Step` — given current state, the furthest step the user can reasonably be on. Used for redirect logic.

- [ ] **Tests:**
  - `stepPath('brief') === '/wizard/brief'`.
  - `prevStep('brief') === null`, `nextStep('generate') === null`.
  - `canEnterStep('recommend', { brief: null, ... }) === false`.
  - `canEnterStep('recommend', { brief: <valid>, ... }) === true`.
  - `firstAllowedStep` returns `brief` for empty state, `recommend` once brief is set, `generate` once selectedRecipe is set.

- [ ] **Acceptance:** Tests pass; types are exported and used by Task 3+.

- [ ] **Commit:** `feat(wizard): add step enum and URL/guard helpers`

### Task 3 — Wizard shell layout + progress bar

- [ ] **Goal:** `/wizard/layout.tsx` provides the shared chrome: a three-step progress bar at the top, a back link to the previous step when applicable, and a "start over" affordance that calls `reset()`.

- [ ] **Files:**
  - **NEW** `src/app/wizard/layout.tsx`
  - **NEW** `src/app/wizard/_components/progress-bar.tsx`

- [ ] **Implementation notes:**
  - Layout is a server component that wraps its `children` with a header containing the progress bar (client component, reads from `useWizardStore`) and a footer with the "start over" button (client component) plus a small "advanced: prompt playgrounds" disclosure linking to `/generate-test` and `/recommend-test`.
  - Progress bar: three dots/labels horizontally — "Brief", "Recommendations", "Generate". The current step is highlighted; completed steps are filled-in; future steps are dimmed. Click a completed step to navigate back to it (uses `canEnterStep` to gate forward jumps).
  - Tailwind only. Match the visual language of `/admin` and `/generate-test`.

- [ ] **Tests:** None for layout/visual chrome — manual verification.

- [ ] **Acceptance:**
  - Visiting any `/wizard/[step]` shows the progress bar with the correct step highlighted.
  - Clicking a previous step in the progress bar navigates back.
  - Clicking a future step is either disabled or no-ops when guard fails.
  - "Start over" clears the store and navigates to `/wizard/brief`.

- [ ] **Commit:** `feat(wizard): add layout shell with progress bar and start-over chrome`

### Task 4 — Step dispatcher + redirect guards

- [ ] **Goal:** `/wizard/[step]/page.tsx` reads the URL param, validates it against `STEPS`, redirects to `firstAllowedStep` if the step is invalid or its prerequisites aren't met, and renders the matching step component.

- [ ] **Files:**
  - **MODIFIED** `src/app/wizard/[step]/page.tsx`
  - **NEW** `src/app/wizard/_hooks/use-wizard-router.ts` — client-side navigation helper

- [ ] **Implementation notes:**
  - The page component is small: validate the `step` param against `STEPS`, render a `<WizardStepShell>` client component that reads the store, checks `canEnterStep`, and either dispatches to `<StepBrief>` / `<StepRecommend>` / `<StepGenerate>` (those are stubs in this task; real implementations land in 4b–4d) or `router.replace(stepPath(firstAllowedStep(state)))`.
  - `useWizardRouter`: a hook that exposes `goNext()` and `goPrev()` based on current step + state.

- [ ] **Tests:** None — wiring code, behavior covered by Tasks 5–10.

- [ ] **Acceptance:**
  - `/wizard/brief` renders a placeholder `<StepBrief>` (still a stub).
  - `/wizard/recommend` with empty store redirects to `/wizard/brief`.
  - `/wizard/generate` with no selectedRecipe redirects appropriately.
  - `/wizard/garbage` redirects to the first allowed step.

- [ ] **Commit:** `feat(wizard): add step dispatcher with prerequisite-aware redirects`

---

## Phase 4b — Brief & Recommend Steps (Tasks 5–7)

### Task 5 — StepBrief form

- [ ] **Goal:** `/wizard/brief` collects the four `Brief` fields (projectName, industry, vibe, description). On submit, validates locally via `BriefSchema` and writes to store; advances to `/wizard/recommend`.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/step-brief.tsx`

- [ ] **Implementation notes:**
  - Mirrors `/recommend-test/_form.tsx` and `/generate-test/_form.tsx` in field layout — projectName, industry, vibe (radio or select), description (textarea, min 10 chars).
  - On submit: parse via `BriefSchema.safeParse`. On failure, render inline errors per field. On success: `setBrief`, then navigate to `/wizard/recommend`.
  - Pre-fill from existing store state when the user navigates back to this step (so editing the brief and going forward again works).

- [ ] **Tests:** None at component level — visual verification.

- [ ] **Acceptance:**
  - Loading `/wizard/brief` shows the form.
  - Submitting with invalid input (short description, empty projectName) shows inline errors.
  - Submitting valid input persists to the Zustand store and navigates to `/wizard/recommend`.
  - Coming back to `/wizard/brief` shows the previously-entered values.

- [ ] **Commit:** `feat(wizard): add StepBrief form with inline validation and store wiring`

### Task 6 — StepRecommend — fetch + render picks

- [ ] **Goal:** `/wizard/recommend` calls `/api/recommend` with the stored brief on mount, renders the result as ranked-pick cards per bucket, and lets the user pick (or swap, or override) before advancing.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/step-recommend.tsx`
  - **NEW** `src/app/wizard/_components/ranked-pick-card.tsx`

- [ ] **Implementation notes:**
  - On mount: if `recommendation` is null in the store, POST `/api/recommend` with the brief; on success, `setRecommendation`. On failure, show error with a "retry" button.
  - Cache the result in the store so re-entering the step doesn't re-spend tokens.
  - Layout: four bucket sections (Aesthetics, Layouts, Interactions, Systems). Interactions and Systems collapsed by default when their picks array is empty (recommender returns empty for briefs that don't need them).
  - `RankedPickCard`: shows entry name, confidence as a bar (0–1 → 0–100% width), reasoning. A radio-style "Select" button (one selected per bucket).
  - "Override" affordance: clicking a small "or pick manually" link opens a select list of all taxonomy entries in that bucket — for when none of the ranked picks fit.
  - Once aesthetic + layout are selected (interactions/systems optional), enable the "Generate" button. On click: `setSelectedRecipe({ brief, aesthetic, layout, interaction?, system? })` and navigate to `/wizard/generate`.

- [ ] **Tests:** None at component level.

- [ ] **Acceptance:**
  - Loading the step with brief set fires `/api/recommend` **exactly once** (verify in DevTools Network panel — including under React StrictMode dev mode).
  - Picks render with confidence bars and reasoning visible.
  - Selecting a pick visually marks it (and unmarks siblings in the bucket).
  - "Override" opens a manual picker.
  - "Generate" is disabled until aesthetic + layout are selected; clicking it persists the recipe and navigates forward.
  - Returning to the step shows the cached recommendation and the prior selection.
  - Effect cleanup follows the pattern in **Rule 2** above — AbortController in setup, abort in cleanup, store-presence guard before firing, primitive-only deps.

- [ ] **Commit:** `feat(wizard): add StepRecommend with ranked-pick cards, swap-to-runner-up, manual override`

### Task 7 — Recipe summary chip + edit-from-generate

- [ ] **Goal:** A small, persistent recipe-summary chip on `/wizard/generate` (and visible on `/wizard/recommend` once a pick is made) showing the current recipe — clicking it returns to `/wizard/recommend` to swap.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/recipe-summary.tsx`

- [ ] **Implementation notes:**
  - Reads `selectedRecipe` from the store. Renders `<aesthetic.name> × <layout.name>` plus the project name from the brief.
  - Click → `router.push('/wizard/recommend')`.

- [ ] **Tests:** None.

- [ ] **Acceptance:** Chip is visible on the generate step; clicking it returns to recommend.

- [ ] **Commit:** `feat(wizard): add recipe summary chip with edit-from-generate navigation`

---

## Phase 4c — Generate Step + Iteration UI (Tasks 8–12)

This is the largest phase. `/wizard/generate` is the only step that streams, archives, allows iteration, and persists the full chain.

### Task 8 — StepGenerate — initial generation stream

- [ ] **Goal:** On entry, if no rounds exist for the current `selectedRecipe`, fire `/api/generate` and stream the result into the preview iframe. On completion, append the round to the store.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/step-generate.tsx`

- [ ] **Implementation notes:**
  - Reuse the SSE consumption logic from `/generate-test/_stream-view.tsx` — same kill-switch pattern, same usage tracking. Extract to a shared hook if cleanest: `useGenerationStream(recipe)`.
  - Active iframe: `srcDoc` bound to the streaming HTML buffer for live updates; on `done`, swap to a stable `<iframe src={`/preview/${artifactId}`} />` so the rendered artifact has its own document context.
  - Render a sidebar (iteration history, Task 10) on the left, the preview iframe centre, and the Refine panel (Task 9) on the right or below.
  - Critical: maintain the same kill-switch pattern from M3 — `AbortController`, button disabled while streaming, server-signal wiring. **Re-read `docs/superpowers/validations/2026-05-10-m3-iteration.md` and the M3 plan's risk table before touching the stream consumer.**

- [ ] **Tests:** None at component level.

- [ ] **Acceptance:**
  - Entering `/wizard/generate` with a fresh recipe starts an SSE stream — **exactly once** (verify under StrictMode).
  - HTML streams into the iframe live.
  - On completion, the round is appended to the store and the iframe switches to `/preview/<id>`.
  - Refreshing the page mid-stream cancels cleanly (no orphan Anthropic call).
  - Re-entering the step after completion does NOT re-fire `/api/generate` — it loads the existing chain from the store.
  - Effect cleanup follows **Rule 2** above. Store-presence guard short-circuits before fetch; AbortController cleanup aborts the SDK call on unmount or step navigation.

- [ ] **Commit:** `feat(wizard): add StepGenerate with streaming preview and round-1 archive write`

### Task 9 — Refine panel (extracted) + iterate API tightening

- [ ] **Goal:** Pull the Refine panel out of `/generate-test/_refine-panel.tsx` into a shared `src/app/wizard/_components/refine-panel.tsx` so both the wizard's generate step and the legacy `/generate-test` can use it. **Simultaneously:** drop `previousHtml` from the wire per Rule 1 above — the iterate route always reads `parent.htmlSource` server-side, the client just sends `previousArtifactId`.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/refine-panel.tsx`
  - **MODIFIED** `src/app/generate-test/_refine-panel.tsx` → re-exports the wizard component or thin wrapper (keep the legacy path working).
  - **MODIFIED** `src/lib/types/iteration.ts` — `previousHtml?` becomes optional on `IterationRequest`.
  - **MODIFIED** `src/lib/schemas/iteration.ts` — Zod schema mirrors; `previousHtml` becomes `z.string().optional()`.
  - **MODIFIED** `src/app/api/iterate/route.ts` — already reads `parent.htmlSource ?? request.previousHtml`; no behaviour change, but `previousHtml` from the body is now optional and typically absent.
  - **MODIFIED** `src/app/generate-test/_stream-view.tsx` — stops sending `previousHtml` in the iterate body.

- [ ] **Implementation notes:**
  - Props: `parentArtifactId`, `parentRound`, `recipe`, `onRoundDone(artifactId)`. The wizard wires `onRoundDone` to `appendRound` + `setActiveArtifactId`; `/generate-test` wires it to its local state.
  - Iterate fetch body shape going forward: `{ recipe, previousArtifactId, feedback }`. No `previousHtml` field.
  - Disabled when parent round ≥ 3 — show "Iteration limit reached. Start a new generation to refine further." with a button that calls `wizardStore.reset()` then navigates to `/wizard/brief`.
  - Kill-switch parity (M3 lesson) — same `useCallback`, `AbortController`, server-signal wiring. Follow **Rule 2** for the effect that fires the submit.
  - Update iteration-assembler tests if any of them currently asserted on `previousHtml` being supplied by the request (the assembler still receives `previousHtml` in its argument — the _route_ hands it the resolved server-side value).

- [ ] **Tests:**
  - Update `src/lib/schemas/__tests__/iteration.test.ts` (if it exists) — a request body without `previousHtml` parses cleanly; a body with it still parses (backward-compat).
  - Manual: hit `/api/iterate` with a body that omits `previousHtml` and a valid `previousArtifactId` — returns a streaming response, archives the round correctly.

- [ ] **Acceptance:**
  - Refine panel works identically on `/generate-test` (no regression).
  - Refine panel on `/wizard/generate` appends new rounds to the wizard store.
  - At round 3, the limit message + new-generation button appear.
  - **Iterate fetch body is < 2 KB** (verified in DevTools Network) regardless of how big the parent's rendered HTML is — Rule 1 holds.
  - Effect submit follows Rule 2 — no double-fire on StrictMode mount.

- [ ] **Commit:** `feat(wizard): extract Refine panel; drop previousHtml from iterate request wire`

### Task 10 — Iteration history tree view

- [ ] **Goal:** Sidebar component that renders the chain of rounds (round 0 = parent, then 1, 2, 3) as a vertical list. Each row shows the iteration round, cost, generatedAt time, optional checkpoint name. Clicking a row sets `activeArtifactId`; the main iframe re-points to that round's preview.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/iteration-history.tsx`

- [ ] **Implementation notes:**
  - Read `rounds` from the store. Sort by `iterationRound` ascending (already true if appended in order).
  - The current `activeArtifactId` row is highlighted; other rows are clickable.
  - Round 0 has a label "Original". Rounds 1+ show "Round 1", "Round 2", etc.
  - Each row has a small "name this checkpoint" pencil icon → opens `<CheckpointNameModal>` (Task 12). If a checkpoint name exists, the name replaces the default "Round N" label.
  - Each row has a "compare with active" toggle — sets `compareWithArtifactId` to that round's id; clicking again clears the comparison.

- [ ] **Tests:** None.

- [ ] **Acceptance:**
  - All rounds in the store render in chronological order.
  - Clicking a non-active row switches the preview to that round.
  - Checkpoint names render when set; default labels otherwise.
  - "Compare with active" sets the second-pane state.

- [ ] **Commit:** `feat(wizard): add iteration history sidebar with click-to-preview and compare-with-active`

### Task 11 — Side-by-side comparison view

- [ ] **Goal:** When `compareWithArtifactId` is set, the main preview pane splits into two iframes: the comparison round on the left, the active round on the right. A small label above each iframe shows which round it is.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/side-by-side-preview.tsx`
  - **MODIFIED** `src/app/wizard/_components/step-generate.tsx` to render `<SideBySidePreview>` when comparison is set, falling back to the single preview iframe otherwise.

- [ ] **Implementation notes:**
  - Two iframes side by side at 50/50 width, both with `src={`/preview/${artifactId}`}` and `sandbox="allow-scripts"` (the preview route already wraps in a sandboxed iframe — double-sandboxing is harmless and keeps the comparison view stand-alone).
  - Above each iframe: a label with the round number, checkpoint name (if any), and a small "×" to close the comparison.
  - On wide viewports (> ~1200px), iframes are stacked horizontally; on narrower viewports (< 1200px) they stack vertically — comparison on narrow screens is less critical but should still work.

- [ ] **Tests:** None.

- [ ] **Acceptance:**
  - Toggling "compare with active" on a non-active row in the history shows the side-by-side view.
  - Closing either pane via "×" clears `compareWithArtifactId` and returns to single preview.
  - Both iframes show the right artifact content (no swap).

- [ ] **Commit:** `feat(wizard): add side-by-side iteration comparison`

### Task 12 — Checkpoint naming modal

- [ ] **Goal:** A small modal triggered from the iteration history pencil icon — text input with the current name (if any) pre-filled, save/cancel buttons. Saves to `rounds[i].checkpointName` via the store.

- [ ] **Files:**
  - **NEW** `src/app/wizard/_components/checkpoint-name-modal.tsx`

- [ ] **Implementation notes:**
  - Roll-your-own modal — a fixed-position overlay with backdrop, `<dialog>` element or a div with `role="dialog"`. Cap name length at 40 chars (UI hint, also store-side: `setCheckpointName` should trim and clamp).
  - Esc closes; backdrop click closes; submit saves and closes.
  - Empty name clears the checkpoint.

- [ ] **Tests:** None.

- [ ] **Acceptance:**
  - Clicking pencil opens the modal with the current name (or empty).
  - Typing a name and submitting persists to the store; sidebar label updates immediately.
  - Esc/backdrop closes without saving.
  - Submitting empty name clears the existing name.

- [ ] **Commit:** `feat(wizard): add checkpoint naming modal and store wiring`

---

## Phase 4d — Cross-Session State (Tasks 13–14)

After 4c, all state lives in the Zustand store. 4d ensures it actually survives a browser refresh and that the wizard handles partial restoration gracefully.

### Task 13 — Persistence verification + edge cases

- [ ] **Goal:** Confirm everything persists correctly: brief, recommendation, selectedRecipe, all rounds, active and compare ids (compare excluded per partialize design), checkpoint names. Handle the case where localStorage state references artifact IDs that have since been deleted from `tmp/generations/` (the archive directory was wiped).

- [ ] **Files:**
  - **MODIFIED** `src/lib/wizard/store.ts` — add `hydrateAndValidate()` action that on store init checks each `rounds[i].artifactId` exists in the archive (server-side call); drops missing entries with a warning.
  - **NEW** `src/app/api/artifact/exists/route.ts` — small read-only endpoint: POST a list of IDs, returns which exist on disk.
  - **MODIFIED** `src/app/wizard/layout.tsx` — call `hydrateAndValidate` on mount.

- [ ] **Implementation notes:**
  - The "artifact missing" case happens in dev a lot (wipe `tmp/generations/` to reset; old wizard state still in localStorage). Don't silently fail — surface "we dropped N previously-saved rounds that are no longer on disk" once, then clean up state.
  - If `activeArtifactId` is among the dropped, set it to the latest remaining round, or null if no rounds remain.

- [ ] **Tests:**
  - Unit-test `hydrateAndValidate` with a mocked existence checker: rounds with missing IDs are dropped; `activeArtifactId` falls back; orphan `compareWithArtifactId` clears.

- [ ] **Acceptance:**
  - Generate a couple of rounds, refresh the page, all state restored.
  - Manually delete one of the round directories from `tmp/generations/`, refresh — the deleted round is gone from the sidebar; no broken iframe in the preview.

- [ ] **Commit:** `feat(wizard): hydrate-and-validate persisted state against archive directory`

### Task 14 — Migration on schema bump

- [ ] **Goal:** Confirm the migration guard from Task 1 works end-to-end: write `frame-bucket-wizard@0` to localStorage manually, load the page, verify the wizard starts fresh.

- [ ] **Files:** No code; manual exercise.

- [ ] **Acceptance:**
  - In dev tools: `localStorage.setItem('frame-bucket-wizard@0', JSON.stringify({...stale...}))`. Reload `/wizard/brief`. Expected: empty form, no state restored.

- [ ] **Commit:** None — manual check.

---

## Phase 4e — Validation Gate (Task 15)

### Task 15 — Wizard end-to-end exercise

- [ ] **Goal:** Manual exercise of the full wizard against a fresh brief, judging usability and surfacing any gaps.

- [ ] **Files:** Findings doc at `docs/superpowers/validations/2026-05-XX-m4-wizard.md`.

- [ ] **Procedure:**
  - From `/wizard/brief`: enter a NEW brief (not one of the three already validated — e.g. an architecture firm or a podcast network — to also stress recommendation on unseen briefs).
  - Click through: recommend → pick → generate → wait for completion → preview.
  - Run a Refine round with structural feedback. Confirm round 1 lands and the sidebar updates.
  - Toggle side-by-side comparison between parent and round 1. Verify both panes render correctly.
  - Name a checkpoint on round 1.
  - Run round 2 (any feedback). Confirm round 3 is reachable and round 4 hits the cap message.
  - Refresh the browser. Confirm wizard state restored: brief, recommendation, rounds, checkpoint name, active round.
  - Click "start over". Confirm everything clears and the page lands on `/wizard/brief` with an empty form.

- [ ] **Acceptance:**
  - The wizard never gets into an inconsistent state across all of the above.
  - Performance: each step transition < 200ms (excluding the API calls themselves).
  - No console errors at any point.
  - Visual hierarchy is intentional (per the user's web/design-quality rules) — the wizard does NOT look like a default template.
  - **Rule 1 holds end-to-end**: open DevTools Network, pick any `/api/iterate` request from the gate run, confirm body size < 2 KB and no `previousHtml` field in the payload.
  - **Rule 2 holds end-to-end**: run the gate with React StrictMode active (default in `next dev`). Across the entire wizard exercise, the Network panel shows exactly one `/api/recommend`, one `/api/generate`, one `/api/iterate` per user action. No double-fired pairs.
  - Subjective: would you hand this to a designer in your network and trust them to use it without instructions? If no, document what's missing.

- [ ] **Commit:** `docs(validation): record M4 wizard gate findings`

---

## Risks & Mitigations

| Risk                                                                                           | Tier   | Mitigation                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Refine panel kill-switch parity regresses when moving the component into wizard**            | High   | Task 9's acceptance criteria explicitly require kill-switch parity. **Re-read M3's iteration validation doc and the `feedback_billable_streams.md` memory before touching the stream consumer.** Don't ship Task 9 without testing browser-refresh-mid-stream and confirming the server log shows abort. |
| **HTML payload regresses; client ships post-injection HTML to `/api/iterate`**                 | High   | Rule 1 in the cross-cutting section above. Task 9 enforces the wire-level change (drop `previousHtml` from the request body). Task 15 validation explicitly inspects the iterate request body size.                                                                                                      |
| **React StrictMode double-fires API calls and burns tokens**                                   | High   | Rule 2 in the cross-cutting section above. Tasks 6, 8, 9 each require the AbortController-cleanup + store-presence-guard pattern. Task 15 validation runs under StrictMode and inspects the Network panel for double-fire pairs.                                                                         |
| **Persisted state with stale artifact IDs causes broken iframes**                              | High   | Task 13's `hydrateAndValidate` drops missing IDs at boot. Surface a one-time notice so the user knows state was cleaned up rather than silently failing.                                                                                                                                                 |
| **Zustand persist conflicts with Next.js SSR**                                                 | Medium | Use `createJSONStorage(() => localStorage)` which is SSR-safe (returns undefined on server). Hydration on first client render; the wizard pages should treat the store as "loading" until after first render.                                                                                            |
| **Recommendation cache miss on every wizard visit**                                            | Low    | The Zustand store caches the result. Re-entering `/wizard/recommend` after a round trip does not re-spend tokens. Confirmed by Task 6's acceptance.                                                                                                                                                      |
| **Wizard becomes the bottleneck; designers can't iterate on prompts without going through it** | Low    | `/generate-test` and `/recommend-test` are deliberately preserved. Footer "advanced" link makes them discoverable from the wizard.                                                                                                                                                                       |
| **localStorage hits its 5 MB quota on long iteration chains**                                  | Low    | We only persist artifact IDs + small metadata, not HTML. A chain of 30 rounds is ~3 KB. Quota is not a real concern at this scope.                                                                                                                                                                       |

---

## Out of Scope (Deferred to M5+)

- **Public artifact URLs / share links**: Right now `/preview/<id>` is unauthenticated but only useful if you have the artifact ID. M5 may add slug-based shareable URLs.
- **Export / embed**: "Copy HTML", "download as static site", "embed in a Notion page" — all M5+.
- **Mobile-first wizard polish**: M4 should not actively break on mobile but the experience is desktop-first. Mobile polish is M7.
- **Recommendation streaming**: Output is small (~1K tokens, < 5s), still no streaming. Deferred unless user demand surfaces.
- **Per-section iteration**: "Only fix the hero" still impossible.
- **Cross-recipe iteration**: Still locked to original recipe.
- **Auth / billing / rate-limiting / error tracking**: Per the scope decision, M4 is internal/demo only.

---

## Build Order Summary

| Tasks | Phase                     | Outcome                                                                                                                                                    |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4   | 4a — Shell + state        | Wizard chrome and routing in place; steps render placeholders. Store persists.                                                                             |
| 5–7   | 4b — Brief & Recommend    | Steps 1 and 2 fully functional. Pick → recipe in store.                                                                                                    |
| 8–12  | 4c — Generate & Iteration | Step 3 streams generation, hosts Refine panel, history sidebar, side-by-side comparison, checkpoint naming. The whole pipeline is now usable from one URL. |
| 13–14 | 4d — Persistence          | Cross-session state survives refresh and handles missing artifacts gracefully.                                                                             |
| 15    | 4e — Validation           | End-to-end exercise; findings doc.                                                                                                                         |

**Estimated implementation time** (subagent-driven, with two-stage review): ~10–14 hours of agent time. Bigger than M3 because of the UI scope and the iteration history surface area.

**Estimated cost of validation runs:** ~$2 in Opus tokens (one full chain — 1 generation + 2 iterations + comparison view exercise). The wizard's gate is mostly UX judgment, not pipeline validation; M3's gates already proved the API surfaces.

When all 15 tasks land green and the validation gate passes, M4 is done. M5 (preview/share polish, export, public surfaces) follows.
