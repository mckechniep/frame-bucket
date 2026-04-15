# Frame Bucket — Design Spec

- **Status**: Draft — awaiting user review
- **Date**: 2026-04-14
- **Owner**: @mckechniep
- **Related**: Notion page "Web Design & UI Style Hub"

---

## 1. Problem & Thesis

Most AI web-design tools treat "style" as one flat concept. Users say "make me a website in dark mode" and get template output because the model has no structured vocabulary to compose from.

Frame Bucket forces a **layered, taxonomy-driven approach**: the user picks ingredients from four orthogonal buckets, each controlling a different layer of the user experience. The AI generates a site by composing a specific recipe, not by interpreting a vague mood.

The thesis: **structured design vocabulary + distilled craft rules + intentional prompt architecture = output that looks like a professional studio built it**, not a generic AI template.

The four buckets (source: user's Notion "Web Design & UI Style Hub"):

1. **Visual Aesthetics** — "what does it look and feel like?" — 22 entries (incl. Retro Terminal)
2. **Layout Patterns** — "how is it arranged?" — 17 entries
3. **Interaction / Behavioral Patterns** — "how does it behave?" — 15 entries (optional)
4. **System Languages / Product Frameworks** — "what reusable rule system?" — 9 entries (optional)

Each of the 63 entries has five metadata fields: Short Definition, Core Mood, Best Use Case, Distinctive Signals, Notes.

---

## 2. Foundational Decisions

These were locked in through clarifying questions during brainstorming.

| Decision | Choice |
|---|---|
| **Audience** | Team/agency now → per-client deploys → public SaaS eventually |
| **Form factor** | Web app (the only form factor that spans all three audience stages) |
| **Taxonomy data strategy** | Admin-triggered sync from Notion → local JSON cache at runtime |
| **Generation output** | Single self-contained HTML file (framework export deferred to v2+) |
| **AI model mix** | Haiku 4.5 for recommendations, Opus 4.6 for generation, with prompt caching |
| **v1 scope** | Standard v1 with localStorage session persistence (no auth, no server DB) |
| **Craft Canon** | Yes in v1 — base canon + 22 aesthetic overrides, all line-reviewed |
| **Override scope** | Aesthetics only; layouts/interactions/systems rely on taxonomy metadata |

---

## 3. Architecture Overview

```
 ┌────────────────────────────────────────────────────────────────────┐
 │                         Browser (client)                           │
 │                                                                    │
 │  Brief form → Wizard (4 buckets) → Generate → Preview iframe       │
 │                              │                                     │
 │                     Zustand store + localStorage                   │
 │                     (brief, recipe, generated HTML, history)       │
 └────────────────────────────────┬───────────────────────────────────┘
                                  │
                          Server Actions / Route Handlers
                                  │
 ┌────────────────────────────────▼───────────────────────────────────┐
 │                     Next.js server (App Router)                    │
 │                                                                    │
 │  /api/recommend      /api/generate      /api/admin/sync            │
 │  (Haiku stream)      (Opus stream)      (Notion pull)              │
 │         │                 │                   │                    │
 │         └────────┬────────┘                   │                    │
 │                  │                            │                    │
 │         ┌────────▼────────┐            ┌──────▼──────┐             │
 │         │  Anthropic SDK  │            │ Notion SDK  │             │
 │         │  + prompt cache │            │  (read)     │             │
 │         └────────┬────────┘            └──────┬──────┘             │
 │                  │                            │                    │
 │         ┌────────▼────────────────────────────▼──────┐             │
 │         │       TaxonomyStore (file | blob)          │             │
 │         └────────────────────────────────────────────┘             │
 └────────────────────────────────────────────────────────────────────┘
                │                                │
         Anthropic API                      Notion API
```

**Four architectural shapes that hold everything together:**

1. **Prompt cache first, variable content last.** Every AI call structures the request as `[system][cached stable content][cache_control marker][variable user input]`. Stable content = craft canon + taxonomy + output contract. This is a positional constraint: reversing it breaks caching entirely.

2. **Streaming everywhere visible.** Recommendations and generation both stream via Server-Sent Events. The wizard shows picks arriving one at a time; the generate screen shows HTML being written in real time. This is what makes the tool feel good.

3. **One source of truth: the `Recipe` object.** The whole user journey produces a single `Recipe` holding `{brief, aesthetic, layout, interaction?, system?}`. Every component reads and writes into it.

4. **Taxonomy = content, not code.** The 63 entries live as pure JSON, loaded once at server start. Editing happens in Notion + admin "Sync from Notion" button. The JSON is not hand-edited.

---

## 4. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) on Node runtime | Server Actions, streaming Route Handlers, clean path to Vercel, easy auth addition later |
| Styling (app) | Tailwind CSS v4 | Fast iteration; pairs with shadcn/ui |
| Styling (generated output) | CSS custom properties only, inline `<style>` | Independent of app's styling; design tokens are first-class |
| State (client) | Zustand, persisted to localStorage | Simple, explicit, no React context boilerplate |
| UI primitives | shadcn/ui (Radix under the hood) | Accessible defaults; theming is intentional, not copy-pasted |
| AI SDK | `@anthropic-ai/sdk` directly (not Vercel AI SDK) | Explicit `cache_control` markers; full control over streaming events |
| Notion | `@notionhq/client` directly | No MCP dependency at runtime |
| Validation | Zod | Schemas for brief form, recipe, Notion response parsing |
| Forms | react-hook-form + Zod resolver | Proven pattern for complex forms |
| Fonts (app) | `next/font` for app chrome | Automatic preload, zero CLS |
| Fonts (generated) | Google Fonts via `<link>` in generated HTML | Matches what a human designer would pick |
| Icons | Lucide | Consistent stroke-based set |
| Syntax highlighting (code view) | Shiki | Server-rendered, no client runtime |
| Deploy target | Vercel first (trivial); self-hostable anywhere via Node | Matches audience progression |

**Explicitly not in stack**:
- Vercel AI SDK (abstracts provider and can hide cache flags — we want tight control)
- TanStack Query (unneeded for v1; no server state to cache)
- Any database (localStorage is the session store; no auth, no server DB in v1)

---

## 5. Data Model

### 5.1 TaxonomyEntry

```ts
interface TaxonomyEntry {
  id: string;                    // slug, e.g. "brutalist"
  bucket: 'aesthetic' | 'layout' | 'interaction' | 'system';
  name: string;                  // "Brutalist / Neo-Brutalist"
  shortDefinition: string;       // from Notion
  coreMood: string;              // from Notion
  bestUseCase: string;           // from Notion
  distinctiveSignals: string[];  // from Notion (multi_select OR comma-split rich_text)
  notes: string;                 // from Notion
  notionId: string;              // for sync diffing
  hasOverride: boolean;          // true for aesthetics in v1; false for others
}
```

### 5.2 Taxonomy

```ts
interface Taxonomy {
  syncedAt: string;              // ISO timestamp
  syncedBy: string;              // admin identifier
  schemaVersion: number;         // for future migrations
  aesthetics: TaxonomyEntry[];   // 22
  layouts: TaxonomyEntry[];      // 17
  interactions: TaxonomyEntry[]; // 15
  systems: TaxonomyEntry[];      // 9
}
```

### 5.3 Brief

```ts
interface Brief {
  projectName: string;
  industry: string;
  vibe: 'mom-and-pop' | 'scrappy-startup' | 'enterprise' | 'custom';
  customVibe?: string;
  colorsProvided?: string[];     // optional hex hints
  description?: string;          // audience, features, inspirations, things to avoid
}
```

### 5.4 Recipe

```ts
interface Recipe {
  brief: Brief;
  aesthetic: TaxonomyEntry;      // required
  layout: TaxonomyEntry;         // required
  interaction?: TaxonomyEntry;   // optional
  system?: TaxonomyEntry;        // optional
}
```

Note: `Recipe` holds full `TaxonomyEntry` references, not just IDs. This is a deliberate snapshot — a regenerated site is reproducible exactly even if the taxonomy changes later.

### 5.5 RecommendationResult

```ts
interface Pick {
  entryId: string;
  rank: number;                  // 1-5
  rationale: string;             // streamed
}

interface RecommendationResult {
  picks: Pick[];
  generatedAt: string;
  modelId: string;
  inputTokens: number;
  cacheReadTokens: number;
  cost: number;                  // USD
}
```

### 5.6 GenerationArtifact

```ts
interface GenerationArtifact {
  id: string;                    // uuid
  generatedAt: string;
  html: string;
  modelId: string;               // pinned version
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;                  // USD
  iterationOf?: string;          // parent artifact id (forms a tree)
  notes?: string;                // user-added
}
```

### 5.7 Session

```ts
interface Session {
  id: string;                    // uuid
  createdAt: string;
  updatedAt: string;
  status: 'brief' | 'wizard' | 'generating' | 'complete';
  wizardStep: 'brief' | 'aesthetic' | 'layout' | 'interaction' | 'system' | 'generate';
  recipe: Partial<Recipe>;       // builds up step by step
  recommendations: {
    aesthetic?: RecommendationResult;
    layout?: RecommendationResult;
    interaction?: RecommendationResult;
    system?: RecommendationResult;
  };
  artifacts: GenerationArtifact[];
  currentArtifactId?: string;
}
```

### 5.8 localStorage Persistence

- Key `frame-bucket:sessions:v1` → JSON map `{ [sessionId]: Session }`
- Key `frame-bucket:active-session` → current session id
- Key `frame-bucket:taxonomy:v` → taxonomy schema version (invalidates artifacts if changed)
- Quota guard: at ~5MB usage, archive oldest artifact HTML (keep metadata). Surface a user-visible warning with cleanup action.
- Versioned keys enable future schema migration without data loss.

---

## 6. The Craft Canon

The most important architectural layer beyond the taxonomy. Distills the user's local skills and rules (`web/design-quality.md`, `web/coding-style.md`, `web/performance.md`, plus relevant `frontend-design`, `ui-design:*`, `interaction-design:*`, `design-systems:*` skills) into direct instructions for the generator.

### 6.1 Purpose

Without the canon, the generator knows "use Brutalist" and produces generic Brutalist template. With the canon, it knows "Brutalist + never ship uniform cards + must hit ≥4 required qualities + tokens as custom properties + compositor-friendly motion + semantic HTML + WCAG AA" and produces a *designed* Brutalist site.

### 6.2 Repo layout

```
src/
├── prompts/
│   ├── craft-canon/
│   │   ├── base.md                    ← universal canon
│   │   ├── _override-template.md      ← blank shape
│   │   └── aesthetics/
│   │       ├── editorial.md
│   │       ├── swiss.md
│   │       ├── brutalist.md
│   │       ├── dark-luxury.md
│   │       ├── glassmorphism.md
│   │       ├── monochrome-minimalism.md
│   │       ├── organic-biomorphic.md
│   │       ├── maximalist.md
│   │       ├── cyberpunk-futuristic.md
│   │       ├── luxury-light.md
│   │       ├── y2k-retro-futurist.md
│   │       ├── neomorphism-soft-ui.md
│   │       ├── flat-design.md
│   │       ├── gradient-aurora.md
│   │       ├── art-deco.md
│   │       ├── vaporwave.md
│   │       ├── memphis-geometric-pop.md
│   │       ├── scandinavian-minimal.md
│   │       ├── hand-drawn-illustrated.md
│   │       ├── corporate-clean.md
│   │       ├── neon-glow.md
│   │       └── retro-terminal.md
│   ├── output-contract.md
│   └── index.ts                       ← parses .md into prompt strings
```

### 6.3 Override file shape

Every aesthetic override shares this shape:

```markdown
# [Aesthetic Name] — Craft Override

## Distinctive Signals (amplify the taxonomy's)
...

## Typography
- Display family type: ...
- Body family type: ...
- Scale / pairing ratio: ...
- Character notes: ...

## Color Behavior
- Palette shape: ...
- Accent role: ...
- Contrast thresholds: ...

## Spacing & Rhythm
...

## Motion Vocabulary
- Duration range: ...
- Easing: ...
- Techniques: ...
- Restraint: ...

## Texture / Atmosphere
...

## Composition
- Grid discipline: ...
- Asymmetry: ...
- Layering: ...

## Rule Modulations (how base canon bends here)
- "Intentional rhythm" → ...
- "Grid-breaking composition" → ...

## Anti-patterns (what would feel wrong for THIS aesthetic)
...

## Reference Touchpoints
- Sites or studios echoing this aesthetic
- Typefaces that work
- Colors that work

## Citations
- [line] → source: `rules/web/design-quality.md`
- [section] → source: `ui-design:type-system` skill
```

### 6.4 Source rules distilled into the base canon

From `rules/web/design-quality.md`:
- Anti-template policy (banned patterns list, required qualities checklist — every site must hit ≥4)
- Required qualities: scale-contrast hierarchy, intentional rhythm, depth/layering, typography with character, semantic color, designed hover/focus/active, grid-breaking composition when appropriate, texture/atmosphere, purposeful motion, designed data visualization

From `rules/web/coding-style.md`:
- Design tokens as CSS custom properties; no hard-coded values
- Animate `transform` / `opacity` / `clip-path` / `filter` only; never `width`/`height`/`top`/`left`/`margin`/`padding`/`border`/`font-size`
- Semantic HTML first (`header`, `nav`, `main`, `section[aria-labelledby]`, `article`, `footer`); not generic div stacks
- Modular sizing via `clamp()` for type and spacing

From `rules/web/performance.md`:
- Explicit `width`/`height` on every image
- `loading="eager" fetchpriority="high"` for hero media only; `loading="lazy"` below fold
- `font-display: swap`; preload only the critical weight/style
- Core Web Vitals floor: CWV passing at 375px, 1024px, 1440px

From `ui-design:*`, `interaction-design:*`, `design-systems:*` skills:
- Typography pairing discipline — real display + functional body, intentional scale ratio
- Color used semantically, with WCAG AA contrast verification
- Spacing from a base unit (4px or 8px)
- Motion principles — purposeful, appropriate ease curves, short durations, `prefers-reduced-motion` aware
- State design — focus rings, hover transitions, active press feedback

### 6.5 Authoring workflow

1. **Base canon drafted first.** I draft `base.md` with every line citing its source rule/skill path. User reviews line-by-line via git diff, comments, iterates.
2. **Seed overrides during M2.** Four aesthetics (Editorial, Swiss, Brutalist, Corporate Clean — the most commercially common) drafted during M2 to unblock generation development. Same line-by-line review cadence.
3. **Remaining 18 overrides in M6.** Batches of 4-5 aesthetics per PR, continuing the same review cadence. App dev continues in parallel; the app auto-picks up new overrides as they land (they're markdown files).

### 6.6 Prompt integration

At request time, `src/prompts/index.ts`:
1. Loads `base.md`
2. Loads `output-contract.md`
3. Loads the selected aesthetic's override file
4. Concatenates into the Anthropic request with `cache_control: { type: 'ephemeral' }` markers at:
   - End of `[base canon + output contract]` — layer 1 cache
   - End of `[aesthetic override]` — layer 2 cache

Multiple cache markers are supported (up to 4 per request in Anthropic's API). Layer 1 is shared across all generations regardless of aesthetic. Layer 2 is shared across generations with the same aesthetic (within 5-minute TTL).

---

## 7. Prompt Contracts

### 7.1 Haiku Recommendation Prompt

**System**: "You are a senior frontend designer. Recommend 3-5 entries from the specified bucket for this brief. Use the taxonomy and the user's prior selections to steer toward compositional coherence."

**Cached prefix** (with `cache_control: ephemeral` at the end):
- base craft canon
- full taxonomy (all 63 entries with full metadata)
- recommendation output contract (describes the `<picks>` XML format)

**Variable user content**:
- `brief`: full Brief object
- `priorSelections`: whatever buckets have been picked already
- `bucketToRecommend`: 'aesthetic' | 'layout' | 'interaction' | 'system'

**Output format** (streamed XML):
```xml
<picks>
  <pick rank="1" id="editorial">
    Long-form, type-led, content-first — fits a bakery story page with photography
    and handwritten provenance notes.
  </pick>
  <pick rank="2" id="scandinavian-minimal">
    ...
  </pick>
</picks>
```

Each `<pick>` renders in the UI the moment it closes during streaming. Client-side parser is forgiving of mid-stream partial tags.

**Fallback**: if XML is malformed on completion, fall back to rendering all bucket entries without ranks, with a banner "AI suggestions unavailable — choose freely."

### 7.2 Opus Generation Prompt

**System**: "You are a senior frontend designer. Produce one self-contained HTML file that meets the craft canon, the output contract, and the recipe."

**Cache layer 1** (with `cache_control: ephemeral` at end):
- base craft canon
- generation output contract

**Cache layer 2** (with `cache_control: ephemeral` at end):
- aesthetic-specific override file

**Variable user content**:
- `recipe`: full Recipe object with all metadata expanded
- generation directive: "Produce one complete .html file. Output ONLY the file, no commentary, no markdown fences."
- optional `iterationFeedback` (v2+)

**Output**: streaming HTML from `<!DOCTYPE html>` through `</html>`.

### 7.3 Generation Output Contract

Lives in `src/prompts/output-contract.md`. Enforces:

- **Single .html file**, complete document, no external JS dependencies, no build step
- **Inline `<style>`** with CSS custom properties at `:root` for all tokens (color, type scale, spacing, motion durations, easings)
- **Inline `<script>`** only when interactivity is demanded by the recipe; vanilla JS, no frameworks, no CDN imports
- **Google Fonts** via `<link rel="stylesheet">` with `display=swap` and only the weights actually used
- **Images**: `https://source.unsplash.com/...` URLs with explicit `width` and `height` attributes; `fetchpriority="high"` for hero only; `loading="lazy"` below the fold
- **Semantic HTML**: `header`, `nav`, `main`, `section[aria-labelledby]`, `article`, `footer`; never generic div stacks for structural elements
- **Responsive**: mobile-first, breakpoints at 640 / 1024 / 1440; modular sizing via `clamp()`
- **Accessibility**: WCAG AA contrast throughout, focus-visible rings, descriptive alt text, skip-to-main link, `prefers-reduced-motion` media query that disables non-essential motion
- **Motion**: animate `transform` / `opacity` / `clip-path` / `filter` only; never layout-bound properties
- **Realistic content**: industry-appropriate copy using the brief's project name; infer plausible product/service names; write 2-3 sentences of real-feeling body copy per section; NO "Lorem ipsum"
- **Output discipline**: emit ONLY the file. No prose, no markdown fences, no commentary before or after.

### 7.4 Cost & latency expectations

| Call | Cold cache | Warm cache (same 5-min window) |
|---|---|---|
| 1st recommendation (seeds cache) | ~$0.20, ~6s | — |
| Subsequent recommendations | — | ~$0.02 each, ~3s |
| Generation | ~$2.00, ~75s | ~$1.20, ~60s |
| **Session total (1 brief + 4 recs + 1 gen)** | **~$2.30** | — |

### 7.5 Error & edge cases

| Scenario | Handling |
|---|---|
| Anthropic timeout / 5xx | Toast + retry button; recipe state preserved |
| Stream interrupted mid-generation | Show partial HTML; offer "regenerate" or "continue from here" (continuation prompt using the partial HTML as assistant prefill) |
| Malformed recommendation XML | Fall back to unranked bucket list with banner |
| Truncated HTML (no `</html>`) | Detect; send continuation prompt |
| Cache miss when expected | Log to console; no user-visible change |

---

## 8. UX Flow

### 8.1 Screens

1. **Landing** — hero + "Start a new design" CTA + recent sessions list (from localStorage)
2. **Brief intake** — form: projectName (required), industry (combobox), vibe (radio), colors (optional), notes (optional)
3. **Aesthetic bucket** — two-pane: card grid (all 22) left, detail panel right. AI Picks stream in with badges. Pick 1 required.
4. **Layout bucket** — same shape, 17 entries
5. **Interaction bucket** — same shape, 15 entries, skippable
6. **System bucket** — same shape, 9 entries, skippable
7. **Generate** — review recipe, click "Generate Design"; streaming code view + stats panel
8. **Preview + iterate** — iframe preview with responsive toggle, action panel (regenerate / edit recipe / download / copy / toggle code), history panel (artifact tree)
9. **Admin** (`/admin`, env-gated) — sync status, sync button, sync log with diff preview

### 8.2 Two-pane bucket layout

Every bucket screen uses the same shape:
- **Left**: card grid of all entries in the bucket. AI-recommended entries get an "AI Pick" badge with rank, stream in with rationale, and reorder to top. All other entries remain visible and selectable.
- **Right**: detail panel showing all 5 taxonomy fields (Short Definition, Core Mood, Best Use Case, Distinctive Signals, Notes) for the currently focused/hovered entry.

Rationale: the 5 metadata fields are dense. Fitting them inside each card produces "busy card" disease. Separating overview (cards) from detail (panel) lets the user browse at-a-glance and drill in when they want to.

### 8.3 Streaming recommendations

The recommendation endpoint streams via SSE. Client-side XML parser emits a "pick ready" event each time a `<pick>` tag closes. The bucket screen subscribes to these events and renders each pick card as it arrives. This creates a sense of the AI "reasoning in public" rather than batching and dumping.

### 8.4 Wizard state management

- `Zustand` store holds the current `Session` object
- Every state change is persisted to localStorage on the next tick
- Browser back/forward navigates wizard steps (`/wizard/[step]` routes)
- Reload resumes at the last step with all selections preserved
- Skip buttons on interaction and system steps set the bucket to `undefined` and advance

### 8.5 Generate screen (during stream)

- Left: streaming HTML in a code view with Shiki syntax highlighting
- Right: stats panel showing elapsed time, token count so far, cache hit indicators (✓ canon, ✓ taxonomy, ✓ override), estimated cost
- Cancel button aborts the stream and discards the partial artifact

### 8.6 Preview screen

- iframe with `srcdoc={html}`, sandboxed
- Responsive breakpoint toggle: 375px / 1024px / 1440px (width-constrained wrapper)
- Action panel: Regenerate (same recipe, new fork), Edit Recipe (back to wizard), Download .html, Copy to clipboard, Toggle code ↔ preview view
- History panel: artifact tree for this session; click to switch the displayed version
- Session totals: token usage, cost to date

### 8.7 App's own visual direction

The app's chrome must pass the same craft canon the generator is asked to pass. A design tool shipped with shadcn defaults undermines its pitch. M7 polish milestone locks the app's aesthetic direction (recommendation: Editorial or Swiss — both disciplined, confident, content-first) and implements it visibly well.

---

## 9. Notion Sync

### 9.1 Pipeline

```
admin clicks Sync
     │
     ▼
POST /api/admin/sync          (ADMIN_SECRET-gated)
     │
     ▼
Notion SDK fetches 4 databases (aesthetics 22, layouts 17, interactions 15, systems 9)
     │
     ▼
Zod validates every entry     (missing field → hard fail, link back to Notion page URL)
     │
     ▼
Compute diff vs existing cache (added / modified / removed / renamed)
     │
     ▼
Preview diff to admin          (DOES NOT write yet)
     │
     ▼ confirm
Write cache + append sync log + invalidate in-memory taxonomy
```

### 9.2 Notion property mapping

```ts
const TaxonomyEntrySchema = z.object({
  notionId: z.string(),
  name: z.string().min(1),                      // title property
  shortDefinition: z.string().min(1),           // rich_text
  coreMood: z.string().min(1),                  // rich_text
  bestUseCase: z.string().min(1),               // rich_text
  distinctiveSignals: z.array(z.string()).min(1),  // multi_select OR comma-split rich_text
  notes: z.string().default(''),                // rich_text, empty allowed
});
```

Normalized into `TaxonomyEntry` shape (adding `id` slug, `bucket`, `hasOverride`) by a mapper after validation.

### 9.3 Runtime storage — `TaxonomyStore` interface

```ts
interface TaxonomyStore {
  get(): Promise<Taxonomy | null>;
  set(taxonomy: Taxonomy): Promise<void>;
  history(limit?: number): Promise<SyncLogEntry[]>;
}
```

Two implementations:
- `FileStore` — reads/writes `data/taxonomy.json` on disk. Dev + self-hosted. Watches file for changes; invalidates in-memory cache.
- `BlobStore` — reads/writes Vercel Blob storage. Vercel-deployed instances.

Selection via `process.env.VERCEL` at boot.

### 9.4 Environment variables

```
ANTHROPIC_API_KEY=sk-ant-...
NOTION_API_KEY=secret_...
NOTION_DB_AESTHETICS=32-char-id
NOTION_DB_LAYOUTS=32-char-id
NOTION_DB_INTERACTIONS=32-char-id
NOTION_DB_SYSTEMS=32-char-id
ADMIN_SECRET=long-random-string
BLOB_READ_WRITE_TOKEN=...            # only on Vercel
DAILY_COST_ALERT_USD=50              # optional dev safety
```

All in `.env.local` (git-ignored). `env.example` committed with placeholders. `env.ts` module validates all env vars at boot with Zod.

### 9.5 Safety

- Two-step sync: preview diff, then confirm. Prevents accidental corruption.
- Rate limit: 1 call / 30s on `/api/admin/sync`
- Abort on any validation failure — old cache stays intact
- Secrets never shipped to client bundle (server-only routes)
- Admin middleware checks `x-admin-secret` header (set by admin page login)

---

## 10. Build Order & Milestones

### M0 — Bootstrap (1-2 days)

- Next.js 15 project scaffold; TypeScript strict; Tailwind v4; shadcn/ui; Zod; Zustand
- Anthropic SDK + Notion SDK installed
- Env var scaffolding with Zod-validated `env.ts` module
- Route skeleton: `/`, `/wizard/[step]`, `/generate`, `/preview/[artifactId]`, `/admin`
- Git repo; pre-commit hook (prettier + eslint + tsc)

### M1 — Taxonomy + Notion sync (2-3 days)

- `TaxonomyEntry` / `Taxonomy` types and Zod schemas
- `FileStore` implementation (defer `BlobStore` until Vercel deploy)
- `/api/admin/sync` route with preview + confirm
- Admin page UI (ADMIN_SECRET-gated)
- First real sync from user's Notion → `data/taxonomy.json` seeded

### M2 — Generation MVP (3-5 days) — the risk-lifter

- Draft `craft-canon/base.md` (first pass, iterated with user)
- Draft 4 seed overrides: Editorial, Swiss, Brutalist, Corporate Clean
- `src/prompts/index.ts` — prompt assembly with cache markers
- `/api/generate` — Opus streaming with `cache_control` on prefix layers
- `/generate-test` page: hardcoded brief + recipe dropdowns, "Generate" button
- Generated HTMLs saved to `/tmp/generations/` for review
- Token/cost telemetry logged per request

**Proof-of-concept target**: produce a reliably great Editorial bakery site, a disciplined Swiss clinic site, a punchy Brutalist record-label site. Judged against the craft canon — not just "did it run." If output is underwhelming, debug the prompt before M3.

### M3 — Recommendation engine (2-3 days)

- `/api/recommend` — Haiku streaming
- Client-side XML stream parser with partial-tag edge case tests
- Minimal bucket UI: card grid, picks stream in as badges
- Malformed-XML fallback (all entries, no ranks)

### M4 — Full wizard (3-4 days)

- Brief form (react-hook-form + Zod)
- Zustand store for session state
- localStorage persistence with versioned keys
- Browser history / deep-linkable steps
- All 4 bucket screens with detail panel
- Skip buttons on interaction & system
- Back/continue navigation preserving prior selections

### M5 — Preview + iterate (2-3 days)

- iframe preview with `srcdoc`, sandboxed
- Responsive breakpoint toggle (375 / 1024 / 1440)
- Regenerate = fork as new artifact (`iterationOf`)
- History panel with session's artifact tree
- Download .html + copy to clipboard
- Toggle code ↔ preview view
- Session/artifact cost + token totals shown

### M6 — Canon completion (1-2 weeks, parallel to M3-M5)

- Remaining 18 aesthetic overrides, batches of 4-5
- Each batch: draft with citations → user line-by-line review via git diff → approved → merged
- App auto-picks up new overrides (they're markdown files)

### M7 — Polish (2-3 days)

- App's visual direction locked and implemented (Editorial or Swiss)
- Error states with helpful copy
- Loading skeletons on every async surface
- Empty states (no sessions, no taxonomy)
- Toast notifications for sync success, copy, etc.
- Keyboard navigation and focus states
- Responsive app UI
- Accessibility audit of the app itself

### M8 — Ship v1

- Deploy to chosen host (Vercel or self-hosted)
- If Vercel: swap FileStore → BlobStore, set env vars, test sync on deployed instance
- Onboard team/agency users; collect feedback
- Tag `v1.0.0`; open v1.1 scope

### Dev-time safeguards (across M2-M7)

- **Prompt playground script** (`pnpm tsx scripts/gen.ts`) — runs generation end-to-end outside the web app
- **Generation archive** — every M2-M7 generation saved to disk with its inputs (regression corpus)
- **Prompt versioning** — prompts in git; every change is a commit (diffable "before/after")
- **Cost alerts** — `DAILY_COST_ALERT_USD` env var warns on threshold

**Total**: ~3-5 weeks of focused work, depending on canon authoring pace.

---

## 11. Risks & Mitigations

### Critical

**R1. Generation quality is mediocre.**
- Cause: canon not distilled well; prompt structure suboptimal; Opus not steered enough.
- Mitigations: M2 risk-lifter milestone; canon separate from taxonomy; per-aesthetic overrides in v1; prompt playground for fast iteration; generation archive for A/B comparison across prompt versions.

### High

**R2. Canon drift.** User's rules/skills evolve; canon doesn't track.
- Mitigation: every canon line cites its source path. Quarterly canon refresh ritual. Changelog on canon.

**R3. Cost runaway.** Users regenerating many times; cache misses more than expected.
- Mitigation: per-session regen cap (default 10). Cost alert env var. Cache hit rate logged. Extended 1h cache TTL for heavy users.

**R4. Notion schema drift.** Field renamed in Notion, sync breaks.
- Mitigation: Zod errors with specific page URLs. Sync aborts on any failure; old cache intact.

**R6. Streaming times out on Vercel.** Hobby tier caps functions at 10s (unusable); Pro tier default is 60s, configurable to 300s. Generation can exceed 75s.
- Mitigation: Vercel deploy requires Pro tier (or self-host) — documented in deploy guide. Configure function timeout to 300s for the generation route. Save partial HTML on interrupt; continuation prompt; non-streaming fallback.

**R8. Accessibility regressions in generated HTML.**
- Mitigation: canon enforces a11y in every aesthetic. Post-generation axe-core auto-run in preview iframe; failures flagged in UI.

**R12. Scope creep.**
- Mitigation: explicit v2+ deferral list (§12). "Not now" culture. Any scope change → pause, update spec, resume.

**R13. App's own UI is generic-looking.**
- Mitigation: M7 polish pass with real aesthetic direction. App must pass its own craft canon.

### Medium

**R5. Anthropic API issues.** Model ID in `env.ts`. Graceful retry. Status awareness.
**R7. HTML breaks in iframe preview.** Sandboxed. Code view toggle. Truncation detector + continuation.
**R9. Browser compatibility.** Canon defines target floor (last-2 Chrome/Safari/Firefox). Progressive enhancement.
**R10. localStorage quota exceeded.** Quota guard archives oldest artifact HTML. Cleanup action in UI.
**R14. Prompt cache doesn't hit.** Deterministic prompt assembly. Cache hit/miss logged.
**R15. Regenerate feels slow.** Streaming masks latency. Warm cache on consecutive regens. v2 "Quick regen" on Sonnet.

### Low

**R11. Admin secret leakage.** `.env.local` git-ignored. `env.example` with placeholders. Rotation trivial. Rate limit on sync limits damage.

---

## 12. Explicitly Deferred to v2+

Items we are consciously leaving out of v1:

- **Authentication / multi-tenant.** Fine for internal and per-client deploys. SaaS-era concern.
- **Team-shared session history.** localStorage is per-browser. v2 adds server DB.
- **Bespoke image generation.** v1 uses Unsplash source URLs. v2 integrates DALL-E / Midjourney / equivalent.
- **Export to framework project** (Astro / Next.js). v1 ships one .html file. v2 programmatically splits into components.
- **Natural-language edit pass** ("make the hero bigger"). v1 iteration path is regenerate with same or modified recipe.
- **Per-layout / per-interaction / per-system overrides.** v1 relies on taxonomy metadata + base canon for those buckets.
- **Multi-page site generation.** v1 generates one page.
- **Billing / usage limits.** SaaS-era.
- **Per-client taxonomy overrides / white-label.** Client deploys ship with the main taxonomy.

---

## 13. Open Questions

These are not decisions needed to start building, but worth flagging before M7:

1. **App's visual direction** — Editorial vs Swiss vs other. Can be decided during M7 with mockups.
2. **Canon ownership model** — if user adds new rules/skills during v1 dev, does the canon re-distill immediately or at a cadence? Recommend: opportunistic during canon review; formal quarterly refresh in v1.1+.
3. **Analytics / usage tracking** — do we want to log (anonymized) which aesthetics/layouts get picked most? Useful for informing taxonomy evolution. Could be v1.1.
4. **Test strategy for generated HTML** — do we run headless-browser visual regression on a golden set of recipes to catch prompt-version regressions? Worth a day in M8 prep.

---

## 14. Appendix — Glossary

| Term | Meaning |
|---|---|
| **Bucket** | One of the four taxonomy layers: aesthetic, layout, interaction, system |
| **Entry** | One item within a bucket (e.g. "Editorial" is an aesthetic entry) |
| **Recipe** | A user's complete selection across buckets + brief |
| **Canon** | Distilled craft rules that constrain generator output quality |
| **Override** | Aesthetic-specific canon fragment that amplifies/modulates the base canon |
| **Artifact** | A single generated HTML file with metadata |
| **Session** | One user's in-progress or completed project: brief + recipe + artifacts |
| **Sync** | Admin-triggered pull of taxonomy from Notion into the local cache |
| **Cache prefix** | The stable portion of an AI request, marked with `cache_control: ephemeral` |
