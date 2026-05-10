# M3 Validation Gate — Iteration Loop

**Date:** 2026-05-10
**Plan task:** Task 15 — Iteration validation (`docs/superpowers/plans/2026-05-05-frame-bucket-m3.md:478`)
**Verdict:** **PASS** (after one architectural fix and one infrastructure gap closed mid-gate)

## Setup

| Step                          | Artifact               | Recipe                       | Cost                    |
| ----------------------------- | ---------------------- | ---------------------------- | ----------------------- |
| Parent generation             | `20260510-143041-cdc0` | editorial + editorial-spread | $1.30 (Opus + 5 images) |
| Round 1 — structural feedback | `20260510-153635-a04d` | iter 1                       | $1.53                   |
| Round 2 — stylistic feedback  | `20260510-163022-2926` | iter 2                       | $1.62                   |
| Round 3 — pointed correction  | `20260510-164840-2214` | iter 3                       | $1.63                   |
| Round 4 — cap test            | (rejected by CLI)      | n/a                          | $0.00                   |
| **Total**                     |                        |                              | **$6.08**               |

Inside the M3 budget (~$8).

Brief was Maple St Bakery. Feedback files for each round live alongside this doc under `docs/superpowers/validations/iterations/`.

## Findings

### Finding 1 — Iteration with image-injected parent blew 1M context window (FIXED mid-gate)

**Severity:** Critical (blocking). **Resolution:** new architecture landed; legacy archives unblocked via fallback.

The first iteration call returned `prompt is too long: 10319849 tokens > 1000000 maximum` from the Anthropic API. Root cause: `injectImages` (`src/lib/generation/inject-images.ts:59`) replaces every `<img src="OPENROUTER:<prompt>">` placeholder with an inline base64 data URI. The resulting HTML for the parent generation was **10.98 MB** with 5 embedded images — about 10.3M tokens when tokenised. The iteration assembler dutifully forwarded that whole document as user-message content.

The model's actual output (with `OPENROUTER:` placeholders intact) was around 46 KB / 12K tokens — well within budget. We were just throwing it away.

**Fix:**

- `ArchiveRecord` gained an optional `htmlSource?: string` field that holds the model's pre-injection output. Both `index.html` (post-injection, served to viewers) and `index-source.html` (pre-injection, used for iteration input) are persisted side by side. `meta.json` carries `htmlSource` too for ergonomic reads.
- `gen.ts`, `/api/generate`, and `/api/iterate` all snapshot `html` immediately before calling `injectImages` and pass it into the archive as `htmlSource`.
- The iteration route (`/api/iterate`) and `iterate.ts` both prefer `parent.htmlSource` over `parent.html` when assembling the next round.
- For legacy archives saved before this change (the parent in this gate qualifies), `iterate.ts` falls back to a regex strip that swaps `<img src="data:image/...">` back to `<img src="OPENROUTER:<alt-text>">`. Lossy — the original generation prompts are unrecoverable so a generic alt-text-derived placeholder is used — but it unblocks the existing parent without re-spending the $1.30 to regenerate.

After the fix, round 1 ran with the lossy fallback. Rounds 2 and 3 used the proper `htmlSource` path — visible in iterate.ts output: no `[iterate] parent has no htmlSource` warning on rounds 2 and 3.

Token usage post-fix:

| Round | Input  | Output |
| ----- | ------ | ------ |
| 1     | 17,396 | 16,903 |
| 2     | 17,511 | 18,126 |
| 3     | 18,472 | 18,065 |

Stable around 17–18K input tokens — a reasonable iteration size, and well under the 1M ceiling.

### Finding 2 — Broad stylistic feedback can leave specific elements untouched (Low; useful behaviour observation, not a bug)

**Severity:** Low. **Resolution:** documented behaviour; pointed follow-up feedback resolves it cleanly.

Round 2's feedback was deliberately broad and subjective ("warmer, less institutional"). The model applied the shift across most of the page — palette warmed toward cream/honey/terracotta, photography moved to golden-hour mood, callout signatures softened. But the hero line ("Flour, salt, water, & the patience of a slow Tuesday.") stayed in the original heavy editorial-display weight, unchanged from the parent. Against the now-warmer page it read as the loudest cold element.

Round 3 used pointed feedback targeted at exactly this line, with specific prescriptions (drop the weight a step, italicise one word, soften the ampersand, shift the colour to warm deep brown). The model acted on it cleanly — the hero line shifted to match the rest of the page, and rounds 1 and 2's changes survived.

**Lesson for the wizard UX (M4):** broad subjective feedback is good for setting overall direction but tends to miss specific elements. Surface a "still doesn't feel right? point at what didn't change" follow-up affordance so users know they can iterate again with pointed feedback rather than concluding "iteration didn't work" on round 2.

### Finding 3 — Preview route was a stub; iteration validation depends on it (FIXED mid-gate)

**Severity:** Medium. **Resolution:** real implementation landed.

`/preview/[artifactId]` rendered only the literal text `Preview / Artifact: <id>` — a placeholder dating from M0 scaffolding. The plan defers full preview UI to M5, but Task 15 validation is fundamentally a visual judgment ("does this iteration meaningfully fix the parent?"), which requires actually rendering the artifact.

**Fix:**

- `src/app/preview/[artifactId]/page.tsx` is now a server component that reads from `defaultArchiveStore()`, returns 404 if the artifact is missing, and renders the HTML inside a sandboxed `<iframe srcDoc>` with `sandbox="allow-scripts"` per spec § 8.6 — scripts inside the artifact run but cannot reach back to the host origin.
- Header strip shows artifact id, recipe, round/cap, cost, model id, plus a Parent link (when iteration), and an Iterations list linking to children sorted by round.
- `ArchiveStore.getChildren()` now returns records with their `id` attached, so the children list can actually link.

This is real M5 prep work that landed early because Task 15 needed it. Future M5 polish (side-by-side comparison, round diff, copy-html button) is still scoped where it was.

### Finding 4 — `iterate.ts` CLI couldn't accept feedback from a file (FIXED mid-gate)

**Severity:** Low. **Resolution:** added `--feedback-file <path>`.

Multi-line, punctuation-heavy feedback (parens, slashes, quotes, en-dashes) is hostile to shell escaping. Added `--feedback-file <path>` mirroring `recommend.ts`'s `--brief-file`. The validation feedback for rounds 1–3 was authored as plain-text files under `docs/superpowers/validations/iterations/` — which doubles as an audit trail for the gate.

## Acceptance Checklist (per plan)

- [x] **Round 1 fixes structural bugs** — yes. Letter-from-the-bench section now single-column at all viewport widths (was splitting into 2 columns with dead space on wide screens). Masthead metadata strip now collapses to "VII · No. 03 · Maple St" on narrow viewports (was wrapping to 2 lines awkwardly). Confirmed visually.
- [x] **Round 1 doesn't regress unrelated parts** — confirmed visually. Hero, bread/hands/bench/counter sections preserved.
- [x] **Round 2 lands stylistic feedback while keeping round 1's structural fix** — yes. Palette shifted to cream/honey/terracotta, photography moved to golden-hour mood, callout signatures softened. Round 1's structural fixes survived. One element missed (Finding 2) — the hero line stayed in the original Editorial weight.
- [x] **Round 3 reachable** — yes. Cost guardrail did not trigger; round 3 ran cleanly and applied the pointed correction (Finding 2 resolved).
- [x] **Round 4 hits the cap cleanly** — yes. Running `pnpm iterate 20260510-164840-2214 "this should be rejected by the round cap"` exits with `Iteration limit reached (round 3/3). Start a fresh generation to continue.` before any API call. Equivalent route-level check returns 429.
- [x] **Each iteration costs ~$2 ± $0.50, completes in < 4 minutes** — yes. Range $1.53–$1.63, elapsed 183–194s.

## Per-Round Detail

### Round 1 — Structural feedback

Feedback file: `docs/superpowers/validations/iterations/2026-05-10-round-1-feedback.txt`. Targeted two specific layout bugs visible in the parent:

1. The "letter from the bench" section split body text into 2 CSS columns on wide desktops, leaving the first paragraph alone in column 1 with dead space below it and the rest jammed into column 2. Asked for single-column at every viewport width, matching mobile.
2. The masthead metadata strip ("Volume VII · No. 03 Autumn Edition · Sixty-Two Years on Maple St") wrapped to 2 lines on narrow viewports. Asked for a truncated form ("VII · No. 03 · Maple St") under ~640px.

Both fixed. Other sections preserved.

### Round 2 — Stylistic feedback

Feedback file: `docs/superpowers/validations/iterations/2026-05-10-round-2-feedback.txt`. Asked for warmer overall feel — cream/honey/terracotta palette, golden-hour photography, softer typography weights, optional paper texture — while keeping all of round 1's structural decisions.

Landed broadly but missed the hero typography (Finding 2). Round 1's structural fixes survived intact.

### Round 3 — Pointed correction

Feedback file: `docs/superpowers/validations/iterations/2026-05-10-round-3-feedback.txt`. Pointed at the one element round 2 missed — the hero line "Flour, salt, water, & the patience of a slow Tuesday." Specific prescriptions: drop the weight one step, italicise "patience" or "slow", soften the ampersand, shift colour to warm deep brown matching the rest of the round-2 palette.

Applied cleanly. All previous-round changes survived.

## Reproducibility

```
pnpm gen editorial editorial-spread
# (capture parent id from Archived as: line)

pnpm iterate <parent-id> --feedback-file docs/superpowers/validations/iterations/2026-05-10-round-1-feedback.txt
# (capture round-1 id)

pnpm iterate <round-1-id> --feedback-file docs/superpowers/validations/iterations/2026-05-10-round-2-feedback.txt
# (capture round-2 id)

pnpm iterate <round-2-id> --feedback-file docs/superpowers/validations/iterations/2026-05-10-round-3-feedback.txt
# (capture round-3 id)

pnpm iterate <round-3-id> "any feedback"
# Should exit 1 with: Iteration limit reached (round 3/3).
```

The `htmlSource` capture is now landed, so reproducing this gate against a fresh parent will not need the lossy fallback path — round 1 will use the model's actual pre-injection output, exactly as intended.
