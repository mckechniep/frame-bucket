# Frame Bucket

Frame Bucket is a **taxonomy-driven AI web design generator**. Instead of asking
a model to invent a style from a blank prompt, every design is grounded in a
**hand-curated database** of design knowledge. A user describes their project, a
fast model **recommends** options from that curated database, the user assembles
a **recipe**, and a frontier model **generates** a single self-contained HTML
page that honors the recipe and a strict craft canon.

The core idea: **the taxonomy is authored by a human, not the LLM.** The model's
job is to _choose_ and _compose_ from a known, opinionated catalog — not to
hallucinate trends. That keeps output consistent, on-brand, and explainable.

---

## How it works

```
  Brief ──▶ Recommend ──▶ Recipe ──▶ Generate ──▶ Iterate / Add pages ──▶ Share
 (human)   (Haiku 4.5)   (human)    (Opus 4.7)        (Opus 4.7)        (snapshot)
              │             │            │
   reads ◀────┘   picks ◀───┘  grounded in craft canon + design contract
 curated taxonomy
```

1. **Brief** — the user describes the project: name, industry, a **posture**
   (boutique / startup / enterprise / custom), a free-text description, and any
   brand colors. _(`src/lib/types/recipe.ts`)_
2. **Recommend** — `POST /api/recommend` sends the brief plus the curated
   taxonomy to **Claude Haiku 4.5**, which returns **ranked picks per bucket**,
   each with a 0–1 confidence score and a short rationale. Selection is cheap and
   fast, so it runs on the small model.
3. **Recipe** — the user reviews the ranked picks and locks in one entry per
   bucket (aesthetic + layout are required; interaction + system are optional).
   A `Recipe` is `brief + aesthetic + layout + interaction? + system?`.
4. **Generate** — `POST /api/generate` streams a single self-contained HTML page
   from **Claude Opus 4.7**, grounded in the recipe, the **craft canon**, and an
   output contract. Image placeholders are filled afterward (see below). The
   artifact is archived and a **site** with a landing page is created.
5. **Iterate** — `POST /api/iterate` refines the current page from natural-language
   feedback (up to 3 rounds per page), reading the parent HTML from the archive
   rather than resending it over the wire.
6. **Add pages** — `POST /api/site/[siteId]/page` generates subpages that match
   the site's **design contract**, with navigation wired in deterministically.
7. **Share** — site-scoped share links serve a point-in-time **snapshot** of the
   pages with working navigation.

---

## The curated database (the 4 visual buckets)

The catalog lives in `data/taxonomy.json` — a local snapshot **synced from
Notion** (the system of record) via `POST /api/admin/sync`. It is hand-authored:
a human curates each entry's definition, mood, best use, and distinctive signals.

Every design is composed from **four buckets**:

| Bucket          | What it controls                                 | Entries | Example              |
| --------------- | ------------------------------------------------ | :-----: | -------------------- |
| **Aesthetic**   | The visual language / vibe                       |   22    | _Retro Terminal_     |
| **Layout**      | Page structure & composition                     |   17    | _Bento_              |
| **Interaction** | Motion / input behavior _(optional)_             |   15    | _Micro-interactions_ |
| **System**      | Underlying design-system discipline _(optional)_ |    9    | _Material Design_    |

_(63 curated entries total at last sync.)_ Each entry carries a stable `id`,
`name`, `shortDefinition`, `coreMood`, `bestUseCase`, a list of
`distinctiveSignals`, and curator `notes` — the exact material the recommender
reasons over.

**Posture** is a separate axis that tunes the whole composition's register:

| Posture        | Register                        |
| -------------- | ------------------------------- |
| **Boutique**   | Warm, hand-considered, local    |
| **Startup**    | Lean, expressive, opinionated   |
| **Enterprise** | Calm, restrained, institutional |
| **Custom**     | Free-text, user-defined         |

---

## The models (and why each one)

| Stage                        | Model                                            | Mode          | Why                                                                                                         |
| ---------------------------- | ------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------- |
| Recommend                    | **Claude Haiku 4.5** (`claude-haiku-4-5`)        | Non-streaming | Selection from a fixed catalog is cheap; small model is fast and sufficient                                 |
| Generate / Iterate / Subpage | **Claude Opus 4.7** (`claude-opus-4-7`)          | SSE streaming | Producing a full, canon-compliant HTML page is the hard part; use the frontier model                        |
| Image fill                   | **OpenRouter → `google/gemini-2.5-flash-image`** | Post-process  | Generated HTML emits `OPENROUTER:` placeholders; these are filled into real `<img>` assets after generation |
| Contract narrative           | **Claude Haiku 4.5**                             | Single call   | One capped (~$0.01) call to enrich the extracted design contract                                            |

Token usage and **cost are tracked on every call** (`src/lib/cost.ts`) and
surfaced in the wizard's history panel.

---

## Craft canon & the output contract

Generation isn't freeform. Every Opus call is prefixed with:

- **Craft canon** (`src/lib/prompts/craft-canon/`) — a layered set of
  **measurable** design rules (e.g. minimum 4.5:1 text contrast, fixed
  breakpoints, a disciplined type scale), with `posture.md` and per-aesthetic
  overrides layered on top. Quantitative thresholds are used deliberately —
  qualitative rules drift under one-shot generation; measurable ones survive.
- **Output contract** (`src/lib/prompts/output-contract.md`) — the structural
  rules the HTML must satisfy (one self-contained file, required nav markers for
  multi-page sites, image placeholder format, etc.).

---

## Sites, subpages & design contracts

- A generation produces a **site** with a landing page (`/`). Artifacts are
  **immutable**; iterating creates a new artifact and advances the page pointer.
- **Add page** generates a subpage in the same visual language. Cross-page
  navigation is injected **deterministically at serve time** between
  `<!-- fb:nav-links -->` markers, so artifacts never have to be rewritten.
- A **design contract** is **extracted from the generated HTML** (it is never
  recalled from the model): `tokens.json` + `tokens.css` plus a Haiku-written
  `contract.md` narrative, cached per artifact and downloadable by both the
  operator and share recipients.

## Sharing

Share links are **site-scoped** and **snapshot** semantics — `/s/<token>` (and
`/s/<token>/<subpage>`) serve exactly the pages as they were when the share was
created, with working in-snapshot navigation.

---

## Getting started

This project uses **pnpm**. (Requires Node ≥ 20.11.)

```bash
pnpm install
pnpm dev            # Next.js 16 dev server (Turbopack) on http://localhost:3000
```

The wizard entry point is `/wizard/brief`. Before recommendations will work, the
taxonomy must be synced from Notion at least once (`/admin`, or
`POST /api/admin/sync`); the recommend route returns `503` until then.

### Scripts

```bash
pnpm lint
pnpm test           # vitest
pnpm typecheck      # tsc --noEmit
pnpm build

# CLI playgrounds (bypass the wizard UI):
pnpm recommend      # brief -> ranked picks
pnpm gen            # recipe -> HTML
pnpm iterate        # artifact + feedback -> HTML
```

### Environment

Copy `.env.example` to `.env.local` and fill in the real values:

- `ANTHROPIC_API_KEY` — recommendation + generation
- `OPENROUTER_API_KEY` — image fill
- `NOTION_API_KEY` + `NOTION_DATA_SOURCE_*` — taxonomy sync (one data source per bucket)
- `FB_ARCHIVE_BACKEND` — `fs` for local dev (artifacts under `tmp/`), `supabase` for production
- `SUPABASE_*` — only when using the Supabase backend

---

## Architecture

- **Next.js 16** (App Router, Turbopack) · **React 19**
- **Zustand** for wizard state (persisted to `localStorage`, hydrated client-side)
- **Zod** for all boundary validation (briefs, recipes, model output)
- **Anthropic SDK** (recommend/generate/iterate) · **OpenRouter** (images)
- Pluggable storage: filesystem (dev) or Supabase (prod) behind a common
  archive/site/contract store interface

### Design principles

- **Curated, not invented** — the model selects from a human-authored taxonomy.
- **Immutable artifacts** — every generation/iteration is a new, addressable artifact.
- **Extracted, not recalled** — the design contract is derived from real output HTML.
- **Abort-safe billing** — streaming routes wire the client abort signal into the
  model call, so an abandoned browser request stops consuming tokens.

> Note: this app diverges from stock Next.js conventions in places — see
> `AGENTS.md`.
