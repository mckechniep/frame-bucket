# Frame Bucket — M6 Design Spec (Sites, Subpages & Design Contracts)

- **Status**: Draft — awaiting user review
- **Date**: 2026-06-02
- **Owner**: @mckechniep
- **Related**:
  - `docs/superpowers/specs/2026-05-16-frame-bucket-m5-design.md` — M5 spec (shares + deploy)
  - `docs/superpowers/plans/2026-05-16-frame-bucket-m5.md` — M5 plan (Tasks 19–21 deploy still pending; they run AFTER M6)
  - `docs/superpowers/specs/2026-04-14-frame-bucket-design.md` — original product spec

---

## 1. Problem & Thesis

M5 made a single generated page shareable. But a client doesn't want a page — they want a **website**, and they want to keep building it after the handoff.

Two gaps:

1. **A Frame Bucket artifact is a dead end.** The recipient gets pixels they can look at but no way to extend them. The design system inside the HTML (tokens, type scale, spacing rhythm, component patterns) is implicit and locked in the `<style>` block. Nothing tells a client's developer — or a client's AI assistant — how to build page two.

2. **Frame Bucket itself can't build page two either.** Every generation is an island. There is no concept of a site, no way to generate an About page that matches the landing page, and no navigation between pages.

M6 ships both halves of the answer, built on one shared primitive — the **design contract**:

- **Design contract as deliverable**: every site exposes a downloadable bundle (`contract.md` + `tokens.json` + `tokens.css`). The markdown is written to be pasted into an AI assistant ("build me a pricing page following this contract exactly"); the JSON/CSS are drop-in files for human developers.
- **Subpages in the wizard**: a free-form "Add page" action generates new pages that follow the contract, with navigation auto-wired across all pages of the site.
- **Site-level shares**: one share link covers the whole site with working navigation (`/s/<token>/about`). Shares are snapshots — the recipient sees the site exactly as it was when shared.

M6 lands **before** the first production deploy. The still-pending M5 deploy tasks (Vercel, migrations CI, validation gate) move to the end of M6 and validate everything at once.

---

## 2. Foundational Decisions

Locked in through clarifying questions during brainstorming on 2026-06-02.

| Decision                       | Choice                                                                               | Reasoning                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract audience**          | Both operator and share recipient                                                    | Operator downloads from wizard; recipient downloads from share page. One contract, two delivery points.                                                                |
| **Contract formats**           | AI-ready `contract.md` + machine `tokens.json` / `tokens.css`                        | Both formats are _functional_ (feed them to a tool). A rendered style-guide page was considered and cut — decorative, not functional.                                  |
| **Contract source**            | Extracted from generated HTML, not model-emitted (Approach A)                        | Token values are provably what's in the page; can't drift. Model-emitted contracts cost ~$0.15–0.30 extra per generation and can contradict the HTML.                  |
| **Contract narrative**         | One small LLM call (Haiku/Sonnet tier) writes rules/guidance around extracted values | ~$0.01 per contract. Extraction gives accuracy; the narrative call gives usefulness.                                                                                   |
| **Contract derivation timing** | Lazy, on first need (Add page / download / share create), cached per artifact        | No fire-and-forget billable calls (per billable-streams discipline). Latency of one Haiku call (~2–5 s) is acceptable at these trigger points.                         |
| **Subpage creation**           | Free-form "Add page" in wizard (describe the page in your own words)                 | Matches Frame Bucket's brief-driven DNA. Page-type templates considered and cut.                                                                                       |
| **Navigation**                 | Auto-wired by Frame Bucket, deterministically                                        | FB owns the link set between marker comments; the model owns the nav's design. No LLM call to update nav.                                                              |
| **Nav injection point**        | At serve/export time — stored artifact HTML is never mutated                         | Artifacts stay immutable. Nav is always derived from the current page manifest (or the share's snapshot manifest). Kills the "patch existing pages" problem entirely.  |
| **Multi-page shares**          | One link per site, working nav, snapshot semantics                                   | The recipient sees the site exactly as shared. Later changes require creating a new share. Matches existing per-artifact share mental model.                           |
| **Site creation**              | Implicit — generating a landing page creates a site named from `brief.projectName`   | No new wizard step. Every wizard run is a site.                                                                                                                        |
| **Legacy artifacts**           | Cannot grow subpages (no retrofit)                                                   | Pre-M6 artifacts lack nav markers. All 65 dev artifacts are test data; prod is empty.                                                                                  |
| **Cross-page design drift**    | Accepted; no auto-resync                                                             | If the landing page iterates after subpages exist, subpages keep their old look. Contract refreshes; user manually iterates subpages if desired. Auto-resync deferred. |
| **Sequencing**                 | M6 features → then deploy (former M5 Tasks 19–21)                                    | Schema changes are cheaper before there is a live production DB. One deploy, one validation gate, covering everything.                                                 |

---

## 3. Architecture Overview

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                              Browser                                     │
 │                                                                          │
 │   Wizard                                    Share viewer                 │
 │   ┌──────────────────────────────┐          /s/<token>[/<slug>]          │
 │   │ PageSwitcher: Home·About·[+] │          ┌────────────────────┐       │
 │   │ AddPageModal  (free-form)    │          │ iframe (sandboxed) │       │
 │   │ FinishActions:               │          │  nav links work    │       │
 │   │  [Create share][Contract ↓]  │          │ [Design contract ↓]│       │
 │   └──────────────────────────────┘          └────────────────────┘       │
 └──────────────┬───────────────────────────────────────┬───────────────────┘
                │                                       │
 ┌──────────────▼───────────────────────────────────────▼───────────────────┐
 │                        Next.js server (App Router)                       │
 │                                                                          │
 │  /api/generate ──► creates site + "/" page                               │
 │  /api/site/[siteId]/page ──► generates subpage (contract-based prompt)   │
 │  /api/site/[siteId]/contract ──► contract bundle (admin)                 │
 │  /api/share ──► creates snapshot share (copies page manifest)            │
 │  /api/share/[token]/contract ──► contract bundle (public)                │
 │  /s/[token]/[[...slug]] ──► serves pinned artifact + injected nav        │
 │                                                                          │
 │   ┌────────────┐  ┌────────────┐  ┌───────────────┐  ┌────────────────┐  │
 │   │ SiteStore  │  │ShareStore  │  │ ContractStore │  │  ArchiveStore  │  │
 │   │ (NEW)      │  │(M5,modified)│ │ (NEW)         │  │  (unchanged)   │  │
 │   └─────┬──────┘  └─────┬──────┘  └──────┬────────┘  └───────┬────────┘  │
 │         │               │                │                   │           │
 │   fs / supabase   memory / supabase   fs / supabase     fs / supabase    │
 │                                                                          │
 │   Render-time modules (pure, no storage):                                │
 │   nav-injector.ts ── injects current page links between fb:nav markers   │
 │   link-rewriter.ts ── maps internal hrefs → share URLs, target="_top"    │
 │                                                                          │
 │   Contract pipeline (pure + one LLM call):                               │
 │   extract-tokens.ts ──► narrative.ts (Haiku) ──► assemble.ts             │
 └──────────────────────────────────────────────────────────────────────────┘
```

Key structural facts:

- **`artifacts` and the iteration tree are untouched.** A page's refinement history is still the existing parent/child chain.
- **Sites group pages; pages point at their active artifact.** `site_pages.artifact_id` moves forward as iterations are accepted.
- **Shares snapshot the manifest.** `share_pages` copies `site_pages` at creation time and never changes.
- **Contracts are keyed by artifact**, not by site — so the wizard (live manifest) and shares (snapshot manifest) share one cache with correct semantics.

---

## 4. File Structure Map

Only new and modified files.

```
supabase/migrations/20260602000000_m6_sites.sql        — NEW

src/lib/sites/                                          — NEW module
  site-store.ts              (interface; SiteRecord, SitePage types)
  site-store-memory.ts       (tests)
  site-store-fs.ts           (dev — tmp/sites/<id>.json)
  site-store-supabase.ts     (prod)
  site-store-factory.ts      (FB_ARCHIVE_BACKEND selects, same as archive)
  nav-injector.ts            (pure — marker parsing + link injection)
  link-rewriter.ts           (pure — share URL mapping)
  slug.ts                    (pure — slug derivation + validation)
  __tests__/

src/lib/contract/                                       — NEW module
  types.ts                   (DesignTokens, DesignContract)
  extract-tokens.ts          (pure — CSS custom props, fonts, scale)
  narrative.ts               (LLM call — rules + guidance prose)
  assemble.ts                (pure — renders contract.md / tokens.json / tokens.css)
  contract-store.ts          (cache interface)
  contract-store-fs.ts       (dev — inside tmp/generations/<artifact-id>/)
  contract-store-supabase.ts (prod — contracts table)
  contract-store-factory.ts
  __tests__/

src/lib/prompts/
  subpage-assembler.ts       — NEW (canon-lite + contract + nav manifest + page brief)
  contract-narrative.ts      — NEW (prompt for the narrative call)
  assembler.ts               — MODIFIED (adds nav-marker instruction)
  iteration-assembler.ts     — MODIFIED (adds preserve-markers instruction)

src/app/api/site/[siteId]/page/route.ts                 — NEW (POST add, DELETE remove)
src/app/api/site/[siteId]/contract/route.ts             — NEW (GET, admin-gated by proxy)
src/app/api/share/route.ts                              — MODIFIED (site-scoped creation, snapshot copy)
src/app/api/share/[token]/contract/route.ts             — NEW (GET, public, Rule 4)
src/app/api/generate/route.ts                           — MODIFIED (creates site + "/" page row)
src/app/api/iterate/route.ts                            — MODIFIED (advances site_pages.artifact_id)

src/app/s/[token]/page.tsx                              — MOVED to [[...slug]]/page.tsx (catch-all)
src/app/s/[token]/[[...slug]]/page.tsx                  — NEW location (slug routing + nav injection)

src/app/wizard/_components/
  page-switcher.tsx          — NEW
  add-page-modal.tsx         — NEW (reuses dialog pattern from create-share-modal)
  finish-actions.tsx         — MODIFIED (+ Download contract; share is site-scoped)
  create-share-modal.tsx     — MODIFIED (site-scoped; shows page count)
  iteration-history.tsx      — MODIFIED (filtered to active page's chain)

src/lib/wizard/store.ts                                  — MODIFIED (siteId, pages[], activeSlug)
src/app/shares/_components/share-row.tsx                 — MODIFIED (site name + page count)
```

---

## 5. Data Model

### 5.1 Migration `supabase/migrations/20260602000000_m6_sites.sql`

```sql
-- Sites: a named group of pages produced by one wizard run
create table sites (
  id          text primary key,
  name        text not null check (char_length(name) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Live page manifest of a site
create table site_pages (
  site_id     text not null references sites(id) on delete cascade,
  slug        text not null,        -- "/", "/about", "/contact"
  title       text not null,        -- nav label: "Home", "About"
  artifact_id text not null references artifacts(id),
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  primary key (site_id, slug)
);
create index site_pages_artifact_idx on site_pages(artifact_id);

-- Design contract cache, keyed by the artifact it derives from
create table contracts (
  artifact_id text primary key references artifacts(id),
  tokens      jsonb not null,
  contract_md text  not null,
  tokens_css  text  not null,
  model_id    text,
  cost        numeric,
  created_at  timestamptz not null default now()
);

-- Shares become site-scoped (BREAKING vs M5 schema; prod has no live data)
alter table shares drop column artifact_id;
alter table shares add column site_id text not null references sites(id);
create index shares_site_idx on shares(site_id);

-- Snapshot of the page manifest at share-creation time
create table share_pages (
  token       text not null references shares(token) on delete cascade,
  slug        text not null,
  title       text not null,
  artifact_id text not null references artifacts(id),
  position    int  not null default 0,
  primary key (token, slug)
);
```

### 5.2 RLS

Unchanged from M5: disabled, service-role only, leak guard enforced (Rule 3).

### 5.3 Dev filesystem layout

- Sites: `tmp/sites/<site-id>.json` — `{ id, name, pages: [{slug, title, artifactId, position}], createdAt, updatedAt }`
- Contracts: `tmp/generations/<artifact-id>/contract.json` + `contract.md` + `tokens.css` (inside the artifact's existing directory)
- Shares stay in `MemoryShareStore` (ephemeral in dev, as in M5) — but `share_pages` snapshot lives inside the share record

### 5.4 Store interfaces

```
SiteStore:
  createSite({ name }) → SiteRecord
  getSite(id) → SiteRecord | null
  addPage(siteId, { slug, title, artifactId, position }) → SitePage
  removePage(siteId, slug) → boolean
  setPageArtifact(siteId, slug, artifactId) → SitePage | null
  listPages(siteId) → SitePage[]

ContractStore:
  get(artifactId) → DesignContract | null
  put(artifactId, contract) → void

ShareStore (M5 interface, modified):
  create({ siteId, name, pages: PageSnapshot[] }) → ShareRecord
  findByToken(token) → ShareRecord | null          (record now includes pages snapshot)
  ...rename / revoke / list / trackViewIfNotRecent unchanged
```

---

## 6. The Design Contract

### 6.1 DesignTokens (extracted, never model-recalled)

`extract-tokens.ts` parses the landing page's HTML — a pure function over a string:

- **Colors**: every `--*` custom property in `:root` whose value parses as a color, with its name and any trailing comment ("acid lime — primary signal")
- **Fonts**: `font-family` declarations + Google Fonts `<link>` URLs → family names, weights, role inference (display/body/mono by usage frequency in headings vs body)
- **Type scale**: `--fs-*` / font-size custom properties, including `clamp()` expressions verbatim
- **Spacing**: `--space-*` / spacing custom properties
- **Other tokens**: radii, shadows, line-heights, transitions — anything in `:root`

Output shape:

```ts
interface DesignTokens {
  colors: { name: string; value: string; note?: string }[];
  fonts: {
    family: string;
    weights: number[];
    role: 'display' | 'body' | 'mono' | 'other';
    source?: string;
  }[];
  typeScale: { name: string; value: string }[];
  spacing: { name: string; value: string }[];
  other: { name: string; value: string }[];
  meta: { extractedFrom: string; recipeSummary: string };
}
```

If extraction yields zero colors AND zero fonts (malformed/unusual artifact), fall back to asking the narrative LLM call to also produce a tokens block — flagged `meta.fallback: true`.

### 6.2 Narrative (one LLM call)

`narrative.ts` calls the cheap model tier (Haiku class, `max_tokens` capped at 2,048) with: extracted tokens + `htmlSource` + `recipeSummary`. It writes prose sections **around** the extracted values — it may not change any value:

1. **Identity** — what this design is, in two sentences
2. **Rules** — measurable do's/don'ts inferred from the page (one accent per viewport, heading font never below X, sections alternate backgrounds...)
3. **Component patterns** — the page's recurring HTML patterns (buttons, cards, section headers) as copy-paste snippets
4. **How to extend** — instructions for adding a page: "Paste this entire document into an AI assistant and say: build me a \_\_\_ page following this contract exactly."

The call is **not streamed to any client** and is awaited server-side with a hard timeout — standard request/response, no billable-stream exposure.

### 6.3 Assembly

`assemble.ts` (pure) renders three files from `DesignTokens` + narrative markdown:

- `contract.md` — identity + tokens tables + rules + component patterns + how-to-extend
- `tokens.json` — design-tokens format (`{ color: { accent: { value: "#c4ff00" } }, ... }`)
- `tokens.css` — `:root { ... }` block, drop-in stylesheet

### 6.4 Lifecycle

```
trigger (Add page | Download | Create share)
   │
   ▼
ContractStore.get(landingArtifactId) ──hit──► use cached
   │ miss
   ▼
extract-tokens → narrative (LLM) → assemble → ContractStore.put → use
```

Contract derivation is keyed by artifact ID. When an iteration is accepted, the page's active artifact changes → next trigger derives a fresh contract for the new artifact. Old contracts stay cached (shares pinned to old artifacts still serve their matching contract).

---

## 7. Subpage Generation

### 7.1 Prompt assembly (`subpage-assembler.ts`)

```
System blocks (cached):
  - base canon: HTML quality, accessibility, responsive rules (subset of existing canon —
    excludes the aesthetic/layout exploration layers, which the contract replaces)
  - design contract (contract.md content)
User block:
  - page brief (user's free-form description)
  - nav manifest: "This site's pages: Home (/), About (/about). You are generating: Pricing (/pricing)"
  - structural summary of the landing page (heading hierarchy + section list, NOT full HTML)
  - nav marker instruction (§ 8.1)
```

Carry-forward cost rules apply: system blocks use prompt caching; the contract block is stable across subpage generations for the same site, so it cache-hits from the second subpage onward.

### 7.2 Flow (`POST /api/site/[siteId]/page`)

1. Zod-validate `{ slug, title, brief }`; slug must match `/^\/[a-z0-9-]*$/`, be unique in the site, max 40 chars
2. Site must exist; site's landing page must have nav markers (legacy check)
3. Derive/fetch contract for the landing page's active artifact
4. Generate via existing Anthropic client wrapper (same cost tracking, same image injection)
5. **Marker validation**: generated HTML must contain `fb:nav-links` markers — if missing, one retry with reinforced instruction; if still missing, fail with `MARKERS_MISSING` error
6. Archive the artifact (existing pipeline), add `site_pages` row
7. Return `{ page, artifact }`

The endpoint follows the 5-point billable-stream audit (client disconnect aborts the Anthropic request).

### 7.3 Iteration on subpages

`POST /api/iterate` works unchanged (it's just an artifact). Two modifications:

- The iteration prompt gains: "preserve the `fb:nav-links` markers and their structure exactly"
- After a successful iteration, `site_pages.artifact_id` advances to the new artifact (latest = active, matching current wizard behavior)

---

## 8. Navigation

### 8.1 The marker contract

Every generated page (landing and subpage) must include, wherever its design places navigation:

```html
<!-- fb:nav-links:start -->
<a class="(model's own classes)" href="/">Home</a>
<a class="(model's own classes)" href="/about">About</a>
<!-- fb:nav-links:end -->
```

- The model designs the nav (placement, structure, classes) — FB owns only the link list between markers.
- Single-page sites still include markers; the nav may be minimal or visually hidden until pages exist.
- The generation prompt (`assembler.ts`) and iteration prompt (`iteration-assembler.ts`) both carry this instruction.

### 8.2 Injection (`nav-injector.ts`, pure)

At **serve/export time only** — stored HTML is never mutated:

1. `extractNavTemplate(html)`: find markers, take the first `<a>` as the link template (preserves the design's own classes/structure)
2. `buildLinks(template, pages, currentSlug)`: one link per page, in `position` order, `aria-current="page"` on the current page
3. `injectNav(html, pages, currentSlug)`: replace marker contents

Injection runs in: wizard preview, `/s/<token>` share serving, standalone preview, and HTML export/download.

### 8.3 Share-mode links (`link-rewriter.ts`, pure)

When serving inside a share: hrefs map `/about` → `/s/<token>/about` and links get `target="_top"` so clicks navigate the full window, not the iframe. Only hrefs matching the share's `share_pages` slugs are rewritten; external links pass through untouched.

The share iframe's sandbox changes from `allow-scripts` to `allow-scripts allow-top-navigation-by-user-activation` — required for nav clicks to escape the iframe. The HTML is generated by our own model (not arbitrary third-party content), and navigation requires user activation, so the added surface is acceptable.

### 8.4 Failure mode

If a page's HTML lacks markers at serve time (shouldn't happen post-validation, but defensive): serve the page as-is and surface a wizard warning chip — "Navigation couldn't be updated on About. Regenerate this page to fix." Never block rendering.

---

## 9. API Surface

### 9.1 Routes

| Route                         | Methods              | Auth       | Purpose                                                      |
| ----------------------------- | -------------------- | ---------- | ------------------------------------------------------------ |
| `/api/generate`               | POST (modified)      | admin      | Generates landing page; now also creates site + `/` page row |
| `/api/iterate`                | POST (modified)      | admin      | Iterates a page; now advances `site_pages.artifact_id`       |
| `/api/site/[siteId]/page`     | POST, DELETE (new)   | admin      | Add / remove a page                                          |
| `/api/site/[siteId]/contract` | GET (new)            | admin      | Contract bundle for the operator                             |
| `/api/share`                  | POST, GET (modified) | admin      | Create snapshot share (`{ siteId, name }`); list shares      |
| `/api/share/[token]`          | PATCH, DELETE (M5)   | admin      | Rename / revoke — unchanged                                  |
| `/api/share/[token]/contract` | GET (new)            | **public** | Contract bundle for the recipient (Rule 4 applies)           |
| `/s/[token]/[[...slug]]`      | GET (modified)       | **public** | Serves the share's pinned page for the slug                  |

### 9.2 Contract download format

Both contract endpoints take `?file=contract.md | tokens.json | tokens.css` and return that single file with correct `Content-Type` and `Content-Disposition: attachment`. The UI presents the three files as a small download menu. (A zip bundle needs a new dependency — deferred; see § 14.)

### 9.3 Share creation (modified `POST /api/share`)

1. Validate `{ siteId, name }`
2. Site must exist and have ≥ 1 page
3. Copy current `site_pages` → `share_pages` rows (the snapshot)
4. Return `{ token, url, name, createdAt, pageCount }`

### 9.4 Share serving (`/s/[token]/[[...slug]]`)

1. `isValidToken(token)` else 404 — **Rule 4, zero store contact**
2. `findByToken` → 404 if missing; revoked view if revoked
3. Normalize slug (`[]` → `/`; `["about"]` → `/about`); look up in share's pages snapshot → 404 if absent
4. Read pinned artifact → inject nav (share-mode links) → render in sandboxed iframe
5. `void trackView(...)` — Rule 5 unchanged; views tracked per share (not per page) in M6

---

## 10. UI Surface

### 10.1 Page switcher (wizard)

Horizontal strip above the preview: `Home · About · Pricing · [+ Add page]`. Mono labels, editorial treatment consistent with the existing kicker pattern. Click switches `activeSlug`; the iteration history sidebar filters to that page's artifact chain. The `+` opens AddPageModal.

### 10.2 AddPageModal

Reuses the established dialog pattern (same `'cancel'`-event handling as create-share-modal — the M4 Finding 2 fix). Fields: page title (text), slug (auto-derived from title, editable, validated live), brief (textarea, free-form). Primary CTA "Generate page" → POST → progress state → on success, switch to the new page.

### 10.3 FinishActions

- "Create share link" stays primary
- New ghost button: "Design contract ↓" → download menu (contract.md / tokens.json / tokens.css)
- Share modal copy notes the share covers "all N pages as they are right now"

### 10.4 Share viewer

- Nav inside the iframe just works (links rewritten, `target="_top"`)
- Footer gains "Design contract ↓" affordance next to "Made with Frame Bucket" — same three-file menu, served from the public endpoint

### 10.5 /shares page

Rows show: share name, **site name + page count** ("SmokeYard · 3 pages"), token fragment, created, views, last viewed. Rename/revoke unchanged.

---

## 11. Cross-Cutting Rules

Rules 1–5 from M3/M4/M5 carry forward unchanged. M6 adds:

- **Rule 6 — Artifacts are immutable.** Nav injection and link rewriting happen at serve/export time. No code path ever updates `artifacts.html` after creation.
- **Rule 7 — Contract values are extracted, never recalled.** The narrative LLM call receives extracted tokens and writes prose around them; it cannot introduce or alter values. Any token in `contract.md` must exist verbatim in the source HTML.
- **Rule 8 — Subpage generation reuses cached system blocks.** The contract block must be byte-identical across subpage generations of the same site (cache discipline carry-forward).
- **Rule 9 — Every billable endpoint passes the 5-point stream audit.** `/api/site/[siteId]/page` and the narrative call inherit the abort-on-disconnect requirements.

Every task touching these areas must cite which rule applies. The validation gate re-checks all nine.

---

## 12. Validation Gate (extends the M5 gate)

The M5 validation gate (former Task 21) becomes the **M6 validation gate**, run against the first production deploy. Additional procedure items:

1. Generate a landing page → site auto-created, page switcher shows "Home"
2. Add two pages (free-form briefs) → both match the landing design; nav appears on all three pages with correct links
3. Download contract from wizard → three files; every color/font value in `contract.md` greps to the landing page HTML (Rule 7 check)
4. Create share → open in private window → click through all pages via nav → URLs are `/s/<token>/<slug>`
5. Iterate the landing page after sharing → refresh the share → **unchanged** (snapshot semantics)
6. Create a second share → shows the new version
7. Download contract from the share footer (no admin cookie) → works; matches the share's pinned version
8. Revoke → all slugs of the share show the revoked view
9. Paste `contract.md` into a fresh Claude conversation + "build me a contact page" → output plausibly matches the design (manual judgment)
10. Rules 1–9 cross-checks (Rule 3 leak grep, Rule 4 curl with bad token, Rule 5 TTFB, Rule 6 artifact immutability spot-check)

---

## 13. Risks & Mitigations

| Risk                                                             | Likelihood | Severity | Mitigation                                                                                                          |
| ---------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Model omits nav markers despite instruction                      | Medium     | Medium   | Post-generation validation + one auto-retry (§ 7.2); never silently accept marker-less pages                        |
| Marker survives but model restructures nav `<a>` template badly  | Low        | Low      | Template cloning takes classes only; degenerate template → plain `<a>` fallback                                     |
| Token extraction misses non-`:root` design systems               | Medium     | Medium   | Fallback to LLM-emitted tokens flagged `meta.fallback` (§ 6.1)                                                      |
| Narrative call fails / times out                                 | Low        | Low      | Contract degrades to tokens + generic how-to-extend template; retry on next trigger                                 |
| `allow-top-navigation-by-user-activation` abused by generated JS | Low        | Low      | Content is first-party model output; requires user activation; revisit if user-supplied HTML ever enters the system |
| Subpage visually drifts from landing page                        | Medium     | Medium   | Contract-based prompting + structural summary; accepted residual risk (manual iteration fixes)                      |
| Wizard store complexity (pages × iterations)                     | Medium     | Medium   | Pages and iteration chains are orthogonal keys; store holds `activeSlug` + existing artifact chain per page         |
| Schema churn after prod deploy                                   | —          | —        | Eliminated by sequencing: M6 lands before first deploy                                                              |

---

## 14. Cost Estimate

| Item                                     | Cost                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Contract narrative call                  | ~$0.01 per contract (Haiku tier, 2k token cap)                                                                                |
| Subpage generation                       | Same order as landing generation (~$0.50–2.00 on Opus); slightly cheaper prompts (contract replaces canon exploration layers) |
| Nav wiring / link rewriting / extraction | $0 (deterministic)                                                                                                            |
| Dev + validation of M6                   | ~$15–25 in generation testing                                                                                                 |

No change to M5's runtime costs (Supabase free tier, Vercel Hobby).

---

## 15. Out of Scope (Deferred)

- Page reordering UI (the `position` column exists; no drag-drop) — M6b
- Page deletion confirmation flow beyond a basic inline confirm — M6b
- Auto-resync of subpages when the landing design evolves — M6b+
- Contract editing / manual overrides — M6b+
- Contract versioning UI (old contracts remain cached but aren't browsable) — M6b+
- Zip bundle for contract download (needs a zip dependency) — M6b
- Per-page view tracking on shares (views are share-level in M6) — M6b
- Export-to-static full site download (contract download covers the spirit; full HTML export still M5b/M6b)
- Embed codes, share TTL, OG unfurl (M5b, unchanged)
- Supabase Auth + real RLS (now M7); a11y/perf/mobile (M8); custom domain (M9)

---

## 16. Open Questions for Planning Phase

1. **Which existing canon layers form the "base canon" subset for subpage prompts** (§ 7.1)? Needs a pass through `src/lib/prompts/canon-layers.ts` during planning to decide what stays vs. what the contract replaces.
2. **Structural summary format** for the landing page in subpage prompts — heading outline only, or section-level description? Decide when writing `subpage-assembler.ts` tests.
3. **Dev-mode share snapshots**: `MemoryShareStore` holds snapshots in-memory (lost on restart, as today). Acceptable for dev, but confirm during planning that the validation gate only exercises snapshots against Supabase.
4. **Does `/api/generate` need a `siteName` override**, or is `brief.projectName` always the site name? (Default: always `brief.projectName`; rename-site deferred.)
