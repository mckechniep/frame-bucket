# Frame Bucket — M6 Implementation Plan (Sites, Subpages & Design Contracts)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship multi-page sites with auto-wired navigation, an extractable design contract (contract.md + tokens.json + tokens.css) downloadable by both the operator and share recipients, snapshot-based site-level shares — then the first production deploy and a validation gate covering everything.

**Architecture:** A new `sites` domain groups pages; each page points at its active artifact (the existing iteration tree is untouched). The design contract is extracted programmatically from generated HTML, enriched by one cheap LLM narrative call, and cached per artifact. Navigation is injected deterministically at serve/export time between `fb:nav-links` markers — stored artifacts are never mutated. Shares pin a snapshot of the page manifest at creation time.

**Tech Stack:** Existing — Next.js 16.2.4 (Turbopack), React 19, Zustand 5, Zod 4, Supabase, Vitest. No new dependencies.

**Related spec:** `docs/superpowers/specs/2026-06-02-frame-bucket-m6-sites-contracts-design.md` (referenced as "spec" throughout)

**Check-in protocol:** Pause for explicit user check-in at every phase boundary (after Tasks 4, 8, 12, 14, 19, 20, 24) and before Task 25 (deploy). Do not auto-chain past a phase boundary.

---

## File Structure Map

See spec § 4 for the full tree. Summary of NEW modules: `src/lib/sites/` (store + nav + slug + link rewriting), `src/lib/contract/` (extraction + narrative + assembly + store), `src/lib/prompts/subpage-assembler.ts` + `contract-narrative.ts`, `src/app/api/site/`, contract download routes, catch-all share viewer, `page-switcher.tsx` + `add-page-modal.tsx`. MODIFIED: share store (site-scoped + snapshots), generate/iterate routes, wizard store, finish-actions, create-share-modal, iteration-history, /shares components, prompt assemblers.

---

## Cost & Cache Strategy

- Contract narrative: `claude-haiku-4-5-20251001`, `max_tokens: 2048`, non-streaming, awaited server-side. ~$0.01 per call, called only on cache miss (Rule from spec § 6.4).
- Subpage generation: same Opus model + streaming pipeline as `/api/generate`. The contract system block must be byte-identical across subpage generations of one site so prompt caching hits (Rule 8).
- Nav injection, link rewriting, token extraction: deterministic, $0.
- All M3/M4/M5 cache discipline carries forward unchanged.

---

## Cross-Cutting Rules

Rules 1–5 from M5 carry forward. M6 adds (spec § 11):

- **Rule 6** — Artifacts are immutable. Nav injection and link rewriting happen at serve/export time only.
- **Rule 7** — Contract values are extracted, never model-recalled. The narrative call writes prose around extracted values.
- **Rule 8** — Subpage generation reuses cached system blocks.
- **Rule 9** — Every billable endpoint passes the 5-point stream audit (abort on disconnect; no orphan saves; no orphan sends; cost tracked; max_tokens capped).

Every task touching a route, store, or prompt must cite which rule applies. Task 27 (validation gate) re-checks all nine.

---

## Phase 6a — Schema & Site Domain (Tasks 1–4)

### Task 1 — M6 migration + regenerated DB types

- [ ] **Goal:** Create `sites`, `site_pages`, `contracts`, `share_pages` tables; convert `shares` to site-scoped. Regenerate `database.types.ts`.

- [ ] **Files:** `supabase/migrations/20260602000000_m6_sites.sql` (NEW — SQL verbatim from spec § 5.1, plus a leading `truncate shares cascade;` since the prod table exists but is empty and `add column site_id ... not null` requires it). `src/lib/supabase/database.types.ts` (REGENERATED via `pnpm db:types`).

- [ ] **Steps:**
  - Write the migration file. Top comment: `-- M6: sites, pages, contracts, snapshot shares. Prod shares table is empty (no deploy has happened); truncate is a no-op guard for dev/preview DBs.`
  - Run `pnpm db:push` → applies to linked `frame-bucket-prod` project.
  - Run `pnpm db:types` → regenerates `src/lib/supabase/database.types.ts`. Commit the generated file.
  - Verify in Supabase SQL editor: `select table_name from information_schema.tables where table_schema = 'public';` → 6 tables (artifacts, shares, share_view_buckets, sites, site_pages, contracts, share_pages = 7 total).

- [ ] **Tests:** SQL smoke test above. `pnpm tsc --noEmit` stays clean after types regen.

- [ ] **Acceptance:** Migration applied; types file compiles; `shares` table has `site_id` column and no `artifact_id`.

- [ ] **Commit:** `feat(db): add M6 migration — sites, pages, contracts, snapshot shares`

### Task 2 — Site domain types + `SiteStore` interface + `MemorySiteStore` + `FsSiteStore`

- [ ] **Goal:** Define the site domain contract and the two non-Supabase implementations.

- [ ] **Files:** `src/lib/sites/site-store.ts` (NEW), `src/lib/sites/site-store-memory.ts` (NEW), `src/lib/sites/site-store-fs.ts` (NEW). Tests: `src/lib/sites/__tests__/site-store-memory.test.ts`, `site-store-fs.test.ts`.

- [ ] **Implementation notes:**
  - `site-store.ts` exports (mirror the ShareStore doc-comment style from `src/lib/shares/share-store.ts`):

    ```ts
    export interface SiteRecord {
      id: string; // "site-" + 12 hex chars from crypto.randomBytes(6)
      name: string;
      createdAt: string; // ISO 8601
      updatedAt: string;
    }

    export interface SitePage {
      siteId: string;
      slug: string; // "/", "/about"
      title: string; // "Home", "About"
      artifactId: string;
      position: number;
      createdAt: string;
    }

    export interface SiteStore {
      createSite(input: { name: string }): Promise<SiteRecord>;
      getSite(id: string): Promise<SiteRecord | null>;
      addPage(
        siteId: string,
        input: { slug: string; title: string; artifactId: string; position: number },
      ): Promise<SitePage>;
      removePage(siteId: string, slug: string): Promise<boolean>;
      setPageArtifact(siteId: string, slug: string, artifactId: string): Promise<SitePage | null>;
      listPages(siteId: string): Promise<SitePage[]>; // ordered by position asc
    }
    ```

  - `MemorySiteStore`: `Map<string, { site: SiteRecord; pages: Map<string, SitePage> }>`. For tests.
  - `FsSiteStore`: persists each site as `tmp/sites/<site-id>.json` (`{ site, pages: SitePage[] }`). `mkdir -p` on first write. Read-modify-write whole file per operation (sites are small). Constructor takes the base dir (default `path.join(process.cwd(), 'tmp', 'sites')`).
  - `addPage` throws if slug already exists in the site (`SLUG_EXISTS` error). `setPageArtifact` returns null for unknown site/slug.

- [ ] **Tests (both implementations, shared test cases):** createSite returns valid record with `site-` prefixed id; getSite null for missing; addPage + listPages ordering by position; addPage duplicate slug throws; removePage true/false; setPageArtifact updates + returns null for missing; FsSiteStore: state survives a second store instance pointed at the same dir (persistence check).

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(sites): add SiteStore interface with memory and fs implementations`

### Task 3 — `SupabaseSiteStore` + factory

- [ ] **Goal:** Production site store against `sites` + `site_pages` tables, plus the env-var factory.

- [ ] **Files:** `src/lib/sites/site-store-supabase.ts` (NEW), `src/lib/sites/site-store-factory.ts` (NEW). Tests: `src/lib/sites/__tests__/site-store-supabase.test.ts`, `site-store-factory.test.ts`.

- [ ] **Implementation notes:**
  - `SupabaseSiteStore implements SiteStore` using `supabaseServer()` per operation — copy the mocked-supabase test pattern from `src/lib/shares/__tests__/share-store-supabase.test.ts` exactly.
  - `listPages`: `.select('*').eq('site_id', siteId).order('position', { ascending: true })`.
  - Factory: same `globalThis[Symbol.for('framebucket.siteStoreSingleton')]` caching pattern as `share-store-factory.ts` (the Turbopack bundle-segregation fix — see project memory). `FB_ARCHIVE_BACKEND=supabase` → Supabase; `fs`/unset → `FsSiteStore`. Export `_resetSiteStoreCacheForTests()`.

- [ ] **Tests:** Same surface as Task 2 against mocked Supabase; factory selects by env (use `vi.stubEnv`), caches instance, reset clears.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean; no `'server-only'` import violations (`pnpm build` succeeds).

- [ ] **Commit:** `feat(sites): add SupabaseSiteStore and backend factory`

### Task 4 — Slug utility

- [ ] **Goal:** Pure slug derivation + validation module. Rule 4 analog for slugs.

- [ ] **Files:** `src/lib/sites/slug.ts` (NEW). Tests: `src/lib/sites/__tests__/slug.test.ts`.

- [ ] **Implementation notes:**

  ```ts
  export const SLUG_REGEX = /^\/[a-z0-9-]*$/; // "/" or "/about", max 40 chars total
  export function deriveSlug(title: string): string; // "About Us" -> "/about-us"
  export function isValidSlug(s: unknown): s is string; // shape + length + regex + not reserved
  export const RESERVED_SLUGS = ['/api', '/s', '/admin', '/shares', '/wizard', '/preview'];
  ```

  - `deriveSlug`: lowercase, strip non-alphanumerics to hyphens, collapse repeats, trim hyphens, prefix `/`. Empty result → `/page`.
  - `isValidSlug` rejects: non-strings, missing leading `/`, uppercase, spaces, >40 chars, reserved prefixes, `//`.

- [ ] **Tests:** derive: simple title, punctuation, unicode, empty, long truncation; validate: all reject cases above + accepts `/`, `/about`, `/team-bios`; round-trip `isValidSlug(deriveSlug(anything))` is true.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(sites): add slug derivation and validation utility`

> **CHECK-IN POINT** — Phase 6a complete. Confirm with user before continuing.

---

## Phase 6b — Contract Pipeline (Tasks 5–8)

### Task 5 — Contract types + token extraction

- [ ] **Goal:** `DesignTokens` types and the pure extractor that parses generated HTML. Rule 7 lives here.

- [ ] **Files:** `src/lib/contract/types.ts` (NEW — `DesignTokens`, `DesignContract` interfaces verbatim from spec § 6.1), `src/lib/contract/extract-tokens.ts` (NEW). Tests: `src/lib/contract/__tests__/extract-tokens.test.ts`. Test fixture: `src/lib/contract/__tests__/fixtures/cyberpunk-artifact.html` (copy `tmp/generations/20260602-160516-468c/index-source.html` — the htmlSource, NOT the image-injected html — into the fixture; trim to the first 200 lines + closing tags if oversized).

- [ ] **Implementation notes:**
  - `extractTokens(html: string, recipeSummary: string): DesignTokens`:
    1. Find the first `<style>` block; within it find `:root { ... }` (handle nested braces by counting).
    2. Parse `--name: value;` pairs. Trailing `/* comment */` on the same line → `note`.
    3. Classify each custom property: value parses as color (hex/rgb/hsl/oklch) → `colors`; name matches `/^--fs-|font-size|^--text-/` → `typeScale`; name matches `/^--space|^--gap/` → `spacing`; else → `other`.
    4. Fonts: regex `font-family:\s*([^;]+)` declarations + Google Fonts `<link>` href `family=` params. Role inference: family used in `h1/h2/--font-display` contexts → `display`; `--font-mono`/`monospace` stack → `mono`; else `body`.
    5. `meta: { extractedFrom: artifactId-or-'inline', recipeSummary, fallback: false }`.
  - Returns empty arrays (never throws) for unparseable HTML — the caller decides fallback (Task 8).

- [ ] **Tests:** Against the fixture: extracts ≥5 colors including `--color-accent: #c4ff00` with note `acid lime — primary signal`; extracts 3 font families with correct roles; extracts `--fs-*` scale with clamp() values verbatim; extracts `--space-*`; `:root`-less HTML → all-empty result with no throw; HTML with nested braces in `:root` (e.g. `@media` inside) parses correctly.

- [ ] **Acceptance:** Tests pass; every extracted value greps verbatim in the fixture (Rule 7 spot-check); `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(contract): add DesignTokens types and HTML token extractor (Rule 7)`

### Task 6 — Contract assembly (md / json / css renderers)

- [ ] **Goal:** Pure renderers from `DesignTokens` + narrative markdown → the three deliverable files.

- [ ] **Files:** `src/lib/contract/assemble.ts` (NEW). Tests: `src/lib/contract/__tests__/assemble.test.ts`.

- [ ] **Implementation notes:**

  ```ts
  export interface AssembledContract {
    contractMd: string; // full AI-ready document
    tokensJson: string; // JSON.stringify(designTokensFormat, null, 2)
    tokensCss: string; // ":root { ... }" block
  }
  export function assembleContract(
    tokens: DesignTokens,
    narrative: ContractNarrative,
    siteName: string,
  ): AssembledContract;
  ```

  - `contractMd` structure (spec § 6.3): `# Design Contract — <siteName>` → Identity (narrative) → Color tokens table → Typography table → Type scale → Spacing → Rules (narrative) → Component patterns (narrative) → How to extend (narrative). Token tables are rendered from `DesignTokens`, NOT from narrative text (Rule 7).
  - `tokensJson`: nest by category — `{ color: { accent: { value, note } }, font: {...}, space: {...}, scale: {...} }`. Token names strip the `--color-`/`--fs-`/`--space-` prefixes.
  - `tokensCss`: re-emit every custom property under `:root`, preserving notes as `/* */` comments.

- [ ] **Tests:** md contains all extracted color values verbatim; md sections appear in spec order; json round-trips through `JSON.parse`; css output contains every custom property name from input; empty narrative sections render with placeholder text "(derived tokens only — narrative unavailable)".

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(contract): add contract.md / tokens.json / tokens.css assemblers`

### Task 7 — Narrative prompt + LLM call

- [ ] **Goal:** The one billable call in the contract pipeline: Haiku writes rules/patterns/how-to-extend around extracted tokens. Rules 7 + 9 apply.

- [ ] **Files:** `src/lib/prompts/contract-narrative.ts` (NEW — prompt builder), `src/lib/contract/narrative.ts` (NEW — the call). Tests: `src/lib/contract/__tests__/narrative.test.ts`, `src/lib/prompts/__tests__/contract-narrative.test.ts`.

- [ ] **Implementation notes:**
  - `contract-narrative.ts`: `buildNarrativePrompt(tokens: DesignTokens, htmlSource: string, recipeSummary: string)` returns `{ system: string, user: string }`. System: "You are documenting an existing design system. You may NOT invent or alter any token value — only describe rules, patterns, and extension guidance for the values provided." User: serialized tokens + the htmlSource (truncated to first 30,000 chars) + required output structure (Identity / Rules / Component patterns / How to extend, as markdown with `## ` headings).
  - `narrative.ts`:

    ```ts
    export interface ContractNarrative {
      identity: string;
      rules: string;
      componentPatterns: string;
      howToExtend: string;
    }
    export const NARRATIVE_MODEL = 'claude-haiku-4-5-20251001';
    export async function generateNarrative(
      tokens: DesignTokens,
      htmlSource: string,
      recipeSummary: string,
    ): Promise<ContractNarrative>;
    ```

  - Non-streaming `client.messages.create` with `max_tokens: 2048`, 30 s timeout via `AbortSignal.timeout(30_000)` (Rule 9: capped, awaited, no orphan stream). Parse the four `## ` sections from the response; missing section → empty string.
  - On ANY error (API, timeout, parse): return a `ContractNarrative` where every field is `''` — caller renders the tokens-only fallback (Task 6 placeholder). Log via `console.error('[contract-narrative] failed', ...)`. Never throw.

- [ ] **Tests:** Mock the Anthropic client (`vi.mock('@/lib/anthropic/client')`). Happy path parses four sections; missing sections → empty strings; API error → all-empty narrative + no throw; prompt builder truncates long HTML; prompt includes every token value (Rule 7 check: narrative input ⊇ extracted values).

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean; no streaming anywhere in the file.

- [ ] **Commit:** `feat(contract): add narrative generation via capped Haiku call (Rules 7, 9)`

### Task 8 — `ContractStore` (fs + supabase + factory) + derive orchestrator

- [ ] **Goal:** Cache layer keyed by artifact id, plus the single entry point `deriveContract()` that the rest of the app calls.

- [ ] **Files:** `src/lib/contract/contract-store.ts` (NEW — interface), `contract-store-fs.ts` (NEW), `contract-store-supabase.ts` (NEW), `contract-store-factory.ts` (NEW), `derive.ts` (NEW — orchestrator). Tests: `src/lib/contract/__tests__/` one file per module.

- [ ] **Implementation notes:**
  - Interface: `get(artifactId): Promise<StoredContract | null>`; `put(artifactId, contract: StoredContract): Promise<void>`. `StoredContract = { tokens: DesignTokens; contractMd: string; tokensJson: string; tokensCss: string; modelId: string; cost: number; createdAt: string }`.
  - Fs impl: writes `contract.json` (the StoredContract) inside `tmp/generations/<artifact-id>/` (the artifact's existing directory).
  - Supabase impl: `contracts` table; map `contract_md`/`tokens_css` columns.
  - Factory: same globalThis singleton + env selection pattern as Task 3.
  - `derive.ts`:

    ```ts
    export async function deriveContract(
      artifactId: string,
      siteName: string,
    ): Promise<StoredContract> {
      // 1. cache hit -> return
      // 2. archive.read(artifactId) -> htmlSource (throw NOT_FOUND if missing)
      // 3. extractTokens(htmlSource, meta.recipeSummary)
      // 4. if tokens.colors.length === 0 && tokens.fonts.length === 0 -> set tokens.meta.fallback = true
      // 5. generateNarrative(...)   (never throws — Task 7)
      // 6. assembleContract(...) -> put -> return
    }
    ```

- [ ] **Tests:** derive: cache hit short-circuits (narrative mock NOT called — spy assertion); cache miss runs full pipeline + caches; missing artifact throws; extraction-empty sets fallback flag; narrative failure still produces a usable contract (tokens-only). Stores: get/put round-trip both impls; factory env selection.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(contract): add contract cache stores and deriveContract orchestrator`

> **CHECK-IN POINT** — Phase 6b complete. Confirm with user before continuing.

---

## Phase 6c — Nav System & Prompt Changes (Tasks 9–12)

### Task 9 — Nav injector

- [ ] **Goal:** Pure module that owns the `fb:nav-links` marker contract. Rule 6 lives here.

- [ ] **Files:** `src/lib/sites/nav-injector.ts` (NEW). Tests: `src/lib/sites/__tests__/nav-injector.test.ts`.

- [ ] **Implementation notes:**

  ```ts
  export const NAV_START = '<!-- fb:nav-links:start -->';
  export const NAV_END = '<!-- fb:nav-links:end -->';
  export interface NavPage {
    slug: string;
    title: string;
    position: number;
  }
  export function hasNavMarkers(html: string): boolean;
  export function injectNav(
    html: string,
    pages: NavPage[],
    currentSlug: string,
    opts?: { hrefFor?: (slug: string) => string; targetTop?: boolean },
  ): string;
  ```

  - `injectNav`: find marker pair (first occurrence only); extract existing content; take the first `<a ...>...</a>` as template (regex, non-greedy); if no `<a>` found use `<a href="%HREF%">%TITLE%</a>` as degenerate template. For each page sorted by position: clone template, replace href value with `opts.hrefFor?.(slug) ?? slug`, replace inner text with title, add `aria-current="page"` if `slug === currentSlug`, add `target="_top"` if `opts.targetTop`. Replace marker content with the new links joined by the same whitespace separator found in the original (default `\n`).
  - Missing markers → return html unchanged (never throw). Caller checks `hasNavMarkers` for warnings (spec § 8.4).

- [ ] **Tests:** Markers + 1 existing link template → 3 pages rendered with template's classes preserved; current page gets aria-current; hrefFor mapping applied; targetTop adds target; no markers → unchanged passthrough; no `<a>` inside markers → degenerate template used; idempotent (inject twice = inject once); marker content with multi-line whitespace preserved.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(sites): add deterministic nav injector with marker contract (Rule 6)`

### Task 10 — Link rewriter for shares

- [ ] **Goal:** Pure module mapping internal hrefs to share URLs.

- [ ] **Files:** `src/lib/sites/link-rewriter.ts` (NEW). Tests: `src/lib/sites/__tests__/link-rewriter.test.ts`.

- [ ] **Implementation notes:**

  ```ts
  export function rewriteLinksForShare(html: string, token: string, knownSlugs: string[]): string;
  ```

  - Regex over `href="..."` attributes. If the href exactly matches a known slug (`/`, `/about`) → rewrite to `/s/<token>` (for `/`) or `/s/<token>/<slug-without-leading-slash>` and add `target="_top"` to that `<a>` tag if not present. All other hrefs (external, anchors, mailto) untouched.
  - Runs AFTER `injectNav` in the share pipeline (nav links + any in-content internal links both get rewritten).

- [ ] **Tests:** `/` and `/about` rewritten with target added; existing target attribute not duplicated; `https://external.com`, `#anchor`, `mailto:` untouched; slug-lookalike not in knownSlugs untouched; html without links unchanged.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(sites): add share link rewriter`

### Task 11 — Nav-marker instructions in generation + iteration prompts

- [ ] **Goal:** Every NEW generation and iteration includes/preserves the marker contract.

- [ ] **Files:** `src/lib/prompts/assembler.ts` (MODIFIED), `src/lib/prompts/iteration-assembler.ts` (MODIFIED). Tests: extend `src/lib/prompts/__tests__/` existing assembler tests.

- [ ] **Implementation notes:**
  - In `assembler.ts`, append to `GENERATION_DIRECTIVE` (src/lib/prompts/assembler.ts:55-58):

    ```
    Include a site navigation appropriate to your design. Wrap ONLY the nav link anchors in these exact marker comments:
    <!-- fb:nav-links:start --> ... <!-- fb:nav-links:end -->
    This page is currently the only page of the site, so render a single link to "/" labeled with the project name. The nav may be visually minimal.
    ```

  - In `iteration-assembler.ts`, append to its directive: `Preserve the <!-- fb:nav-links:start --> ... <!-- fb:nav-links:end --> marker comments and their anchor structure exactly as they appear in the previous version.`
  - Both additions go INSIDE the existing directive constants (not new system blocks) so cache structure is unchanged (Rule 8).

- [ ] **Tests:** Assembled generation request's user content contains `fb:nav-links:start`; iteration request directive contains "Preserve the"; existing assembler tests still pass (cache_control block count unchanged).

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean. Manual: run one dev generation, confirm output HTML contains both markers (`grep "fb:nav-links" tmp/generations/<new-id>/index-source.html`).

- [ ] **Commit:** `feat(prompts): require fb:nav-links markers in generation and iteration output`

### Task 12 — Subpage prompt assembler

- [ ] **Goal:** The contract-based prompt for generating subpages. Rule 8 applies.

- [ ] **Files:** `src/lib/prompts/subpage-assembler.ts` (NEW). Tests: `src/lib/prompts/__tests__/subpage-assembler.test.ts`.

- [ ] **Implementation notes:**

  ```ts
  export interface SubpageRequest {
    contractMd: string; // from deriveContract
    pageBrief: string; // user's free-form description
    pageTitle: string;
    pageSlug: string;
    navManifest: NavPage[]; // existing pages incl. the one being created
    landingStructure: string; // heading outline of landing page (see below)
  }
  export async function assembleSubpageRequest(req: SubpageRequest): Promise<AnthropicRequest>;
  ```

  - System blocks: [0] same role sentence as `assembler.ts`; [1] posture + base canon + output contract (REUSE `loadCanonLayers` but pass a recipe-less variant — add `loadInvariantLayers()` to `canon-layers.ts` returning just the three invariant layers, no aesthetic override) with `cache_control: ephemeral`; [2] `## Design Contract (follow exactly)\n\n${contractMd}` with `cache_control: ephemeral` — this block must be byte-identical across calls for the same site (Rule 8).
  - User content: page title/slug + brief + nav manifest serialized ("This site's pages: Home (/), About (/about). You are generating: Pricing (/pricing)") + landing structure + the marker directive from Task 11 adjusted: "render one nav link per page in the manifest".
  - `landingStructure` helper `outlineHtml(html: string): string` (same file): extracts `<h1>`–`<h3>` text + `<section>` count → "H1: SmokeYard — AI Design / H2: Services / H2: Pricing / 6 sections". Max 500 chars.
  - Open question § 16.1 resolution: posture + base canon + output contract STAY; aesthetic override and taxonomy entries are REPLACED by the contract block.

- [ ] **Tests:** System block [1] identical to what `loadInvariantLayers()` returns; block [2] contains contractMd verbatim; user content contains brief, manifest, marker directive; outlineHtml extracts headings from fixture; cache_control present on blocks [1] and [2].

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(prompts): add contract-based subpage assembler (Rule 8)`

> **CHECK-IN POINT** — Phase 6c complete. Confirm with user before continuing.

---

## Phase 6d — Share Domain Changes (Tasks 13–14)

### Task 13 — Site-scoped `ShareStore` interface + `MemoryShareStore` update

- [ ] **Goal:** Shares point at sites and carry a page snapshot. Breaking interface change, all callers updated in Tasks 19–20.

- [ ] **Files:** `src/lib/shares/share-store.ts` (MODIFIED), `src/lib/shares/share-store-memory.ts` (MODIFIED). Tests: update `src/lib/shares/__tests__/share-store-memory.test.ts`.

- [ ] **Implementation notes:**
  - `ShareRecord`: replace `artifactId: string` with `siteId: string` and add `pages: SharePageSnapshot[]` where `SharePageSnapshot = { slug: string; title: string; artifactId: string; position: number }`.
  - `ShareStore.create` input becomes `{ siteId: string; name: string; pages: SharePageSnapshot[] }`.
  - All other methods keep their signatures (findByToken/list/rename/revoke/trackViewIfNotRecent).
  - MemoryShareStore: store pages array on the row; `create` deep-copies the input pages (snapshot semantics — later mutations of the caller's array must not affect the share).

- [ ] **Tests:** Update existing tests for the new create signature; ADD: created share's pages match input; mutating the input array after create does NOT change the stored snapshot; pages survive findByToken.

- [ ] **Acceptance:** Share-store-memory tests pass. NOTE: `pnpm tsc --noEmit` will FAIL at this point (API routes still use artifactId) — that is expected mid-phase; Tasks 19–20 fix the callers. Do NOT commit broken types: combine this task's commit with Task 14 if needed, or temporarily keep the old `artifactId` field as deprecated-optional and remove it in Task 19. **Chosen approach: keep `artifactId?: string` as optional deprecated field through Task 19, so every commit type-checks.**

- [ ] **Commit:** `feat(shares): make ShareStore site-scoped with page snapshots (transitional)`

### Task 14 — `SupabaseShareStore` update

- [ ] **Goal:** Production share store writes/reads the `share_pages` snapshot table.

- [ ] **Files:** `src/lib/shares/share-store-supabase.ts` (MODIFIED). Tests: update `src/lib/shares/__tests__/share-store-supabase.test.ts`.

- [ ] **Implementation notes:**
  - `create`: insert into `shares` (`token, site_id, name`), then batch-insert `share_pages` rows. If the pages insert fails, delete the shares row (manual rollback — Supabase JS has no transactions) and rethrow.
  - `findByToken`/`list`: select shares, then select `share_pages` for the token(s) (`.in('token', tokens)` for list — one extra round-trip, not N).
  - `rowToRecord` maps both tables into `ShareRecord`.

- [ ] **Tests:** create inserts both tables (verify both mock calls); pages-insert failure rolls back the share row; findByToken includes ordered pages; list batches the pages query (single `.in()` call assertion).

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean (transitional optional field from Task 13 still in place).

- [ ] **Commit:** `feat(shares): write share_pages snapshots in SupabaseShareStore`

> **CHECK-IN POINT** — Phase 6d complete. Confirm with user before continuing.

---

## Phase 6e — API Routes (Tasks 15–19)

### Task 15 — `/api/generate` creates the site

- [ ] **Goal:** Landing-page generation creates a `SiteRecord` + the `/` page row. The wizard learns the siteId from the `done` event.

- [ ] **Files:** `src/app/api/generate/route.ts` (MODIFIED — after the `archive.save` call at src/app/api/generate/route.ts:95-106). Tests: `src/app/api/generate/__tests__/route.test.ts` (extend if present; create if not).

- [ ] **Implementation notes:**
  - After `archive.save(...)` succeeds:

    ```ts
    const siteStore = defaultSiteStore();
    const site = await siteStore.createSite({ name: recipe.brief.projectName });
    await siteStore.addPage(site.id, {
      slug: '/',
      title: 'Home',
      artifactId: archiveId,
      position: 0,
    });
    ```

  - `done` event payload gains `siteId: site.id`.
  - Rule 9 check: site creation happens inside the existing try/catch AFTER the stream completes — an aborted stream (AbortError path at route.ts:119) never creates an orphan site.

- [ ] **Tests:** Mocked stores: done event includes siteId; site named from brief.projectName; page row has slug `/` + the archived artifactId; abort path creates no site (spy not called).

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean. Manual dev run: generate → `tmp/sites/` contains one site JSON pointing at the new artifact.

- [ ] **Commit:** `feat(api): create site + home page row on landing generation`

### Task 16 — `/api/iterate` advances the page pointer

- [ ] **Goal:** Iterating a page moves `site_pages.artifact_id` to the new artifact.

- [ ] **Files:** `src/lib/schemas/iteration.ts` (MODIFIED — `IterationRequestSchema` gains `siteId: z.string().optional()` and `slug: z.string().optional()`), `src/app/api/iterate/route.ts` (MODIFIED). Tests: extend `src/lib/schemas/__tests__/iteration.test.ts` + iterate route tests.

- [ ] **Implementation notes:**
  - After the iterate route's `archive.save` (src/app/api/iterate/route.ts:167): if `siteId && slug` present in the validated body → `await defaultSiteStore().setPageArtifact(siteId, slug, artifactId)`. Null result (unknown site/slug) → log warning, don't fail the response (the artifact is already saved; the wizard will surface staleness).
  - `done` event unchanged (wizard already knows siteId/slug — it sent them).

- [ ] **Tests:** Schema accepts body with and without siteId/slug; route calls setPageArtifact only when both present; unknown site/slug → response still succeeds.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(api): advance site page pointer on iteration`

### Task 17 — `POST` + `DELETE /api/site/[siteId]/page`

- [ ] **Goal:** The subpage generation endpoint (the second billable streaming endpoint) and page removal. Rules 8 + 9.

- [ ] **Files:** `src/app/api/site/[siteId]/page/route.ts` (NEW). Tests: `src/app/api/site/[siteId]/page/__tests__/route.test.ts`.

- [ ] **Implementation notes:**
  - `POST` body schema: `z.object({ slug: z.string(), title: z.string().trim().min(1).max(60), brief: z.string().trim().min(10).max(2000) })`. Validate `isValidSlug(slug)` + slug not already in site (`SLUG_EXISTS` → 409).
  - Flow: site exists (404 if not) → landing page (`/`) exists in site (400 `NO_LANDING` if not) → landing artifact has nav markers (`hasNavMarkers`; 400 `LEGACY_ARTIFACT` if not — spec legacy rule) → `deriveContract(landingArtifactId, site.name)` → `assembleSubpageRequest(...)` → stream via the SAME SSE pattern as `/api/generate` (copy the abort-signal wiring verbatim from src/app/api/generate/route.ts:50-76 — Rule 9) → post-generation marker validation: `hasNavMarkers(html)`; missing → ONE retry with reinforced directive appended to user content; still missing → `error` SSE event `MARKERS_MISSING` (no archive save) → `archive.save` → `siteStore.addPage` → `done` event `{ artifactId, slug, usage, cost, html }`.
  - `DELETE` body: `{ slug }`. Removing `/` → 400 `CANNOT_DELETE_HOME`. Returns `{ removed: boolean }`. Artifacts are never deleted (Rule 6 — archive untouched).

- [ ] **Tests:** Slug validation (invalid shape 400, reserved 400, duplicate 409); missing site 404; legacy landing 400; marker-missing retry path (first mock response without markers, second with → saved); double marker failure → error event + no save (spy); abort → no save no addPage; DELETE home blocked; DELETE removes row.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(api): add subpage generation and removal endpoint (Rules 8, 9)`

### Task 18 — Contract download routes (operator + recipient)

- [ ] **Goal:** Both download endpoints serving the three contract files.

- [ ] **Files:** `src/app/api/site/[siteId]/contract/route.ts` (NEW — admin, gated by existing proxy), `src/app/api/share/[token]/contract/route.ts` (NEW — public, Rule 4), `src/proxy.ts` (MODIFIED — public allowlist entry for the recipient contract route), `src/__tests__/proxy.test.ts` (MODIFIED if proxy tests exist; create coverage for the new public path either way). Tests: one test file per route.

- [ ] **Implementation notes:**
  - Both: `GET` with `?file=` param ∈ `{contract.md, tokens.json, tokens.css}` (400 otherwise).
  - Site route: site exists → landing page artifact → `deriveContract(...)` → serve requested file. Headers: `Content-Type` (`text/markdown` / `application/json` / `text/css`), `Content-Disposition: attachment; filename="<siteName-slug>-<file>"`.
  - Share route: `isValidToken(token)` FIRST (Rule 4, 404 + zero store calls) → findByToken → 404 missing / 410 revoked → contract for the SHARE'S pinned `/` artifact (`share.pages.find(p => p.slug === '/')`) → serve. Add `X-Robots-Tag: noindex` header.
  - The proxy public allowlist (src/proxy.ts) must include `/api/share/` GET paths — verify the existing `/s/*` + `/api/admin` gating logic; add `'/api/share/'` prefix to the public list ONLY for the `[token]/contract` GET (check how proxy matches; simplest: make the contract route path `/api/share/[token]/contract` public by prefix `/api/share/` and rely on Rule 4 + the existing PATCH/DELETE staying admin-gated via their own checks — confirm with proxy tests).

- [ ] **Tests:** Site route: bad file param 400; missing site 404; happy path content-type + disposition per file. Share route: invalid token 404 with zero store calls (Rule 4 spy); revoked 410; valid → file content matches derived contract; robots header present.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean; proxy test confirms recipient route reachable without admin cookie, operator route NOT reachable without it.

- [ ] **Commit:** `feat(api): add contract download routes for operator and recipients (Rule 4)`

### Task 19 — Site-scoped `/api/share` + drop transitional field

- [ ] **Goal:** Share creation takes `siteId`, snapshots the page manifest. Remove the deprecated `artifactId` field from Task 13.

- [ ] **Files:** `src/app/api/share/route.ts` (MODIFIED), `src/lib/shares/share-store.ts` (MODIFIED — remove transitional field), `src/app/api/share/[token]/route.ts` (unchanged — verify only). Tests: update `src/app/api/share/__tests__/route.test.ts`.

- [ ] **Implementation notes:**
  - `CreateBody` becomes `z.object({ siteId: z.string().min(1), name: z.string().trim().min(1).max(120) })` (keep the trim-order comment from src/app/api/share/route.ts:10-14).
  - POST flow: site exists (404) → `listPages` (400 `EMPTY_SITE` if zero) → map to snapshots → `store.create({ siteId, name, pages })` → response gains `pageCount`.
  - Remove `artifactId?` from ShareRecord; run `pnpm tsc --noEmit` and fix every remaining caller (expected: `/shares` page components + wizard share indicator — list them in the commit body).

- [ ] **Tests:** POST validates siteId; empty site 400; snapshot copies all pages; GET list unchanged; typecheck passes with transitional field gone.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean repo-wide; `pnpm test` full suite green.

- [ ] **Commit:** `feat(api): site-scoped share creation with page snapshots`

> **CHECK-IN POINT** — Phase 6e complete. Confirm with user before continuing.

---

## Phase 6f — Share Viewer (Task 20)

### Task 20 — Catch-all share route with nav + contract download

- [ ] **Goal:** `/s/<token>` and `/s/<token>/<slug>` serve the snapshot's pages with working nav. Footer gains contract download. Also: delete the stray empty `src/app/s/\[token\]/` directory (untracked shell accident).

- [ ] **Files:** Move `src/app/s/[token]/page.tsx` → `src/app/s/[token]/[[...slug]]/page.tsx` (git mv). `revoked-view.tsx`, `not-found.tsx` stay at `[token]/` level. `share-footer.tsx` (MODIFIED — contract download menu). Delete stray `src/app/s/\[token\]/` dir. After the move: `rm -f .next/types/validator.ts .next/dev/types/validator.ts` (stale route validator — see project memory).

- [ ] **Implementation notes:**
  - `[[...slug]]/page.tsx`: `const { token, slug: slugParts } = await params` → `isValidToken` (Rule 4) → `findByToken` → revoked → normalize slug (`undefined` → `/`; `['about']` → `/about`) → `share.pages.find(p => p.slug === slug)` → `notFound()` if absent → `archive.read(page.artifactId)` → `injectNav(html, share.pages, slug, { hrefFor: shareHref(token), targetTop: true })` → `rewriteLinksForShare(...)` → iframe `sandbox="allow-scripts allow-top-navigation-by-user-activation"` (spec § 8.3) → `void trackView(...)` (Rule 5, share-level).
  - `share-footer.tsx`: add "Design contract ↓" link group → three `<a href="/api/share/<token>/contract?file=...">` entries in a small popover (no client JS beyond a `<details>` element — keep it server-renderable).
  - Metadata export (robots noindex) carries over from the old page.tsx unchanged.

- [ ] **Tests:** None at component level (server components — covered by Task 27 gate). Route-logic helpers (slug normalization) extracted to `src/lib/sites/slug.ts` `normalizeSlugParts(parts: string[] | undefined): string` + unit tested there.

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean (after validator cleanup); `pnpm build` passes. Manual dev: create 2-page site → share → `/s/<token>` shows landing with nav → click About → URL changes to `/s/<token>/about`, About renders; `/s/<token>/nonexistent` → 404; footer downloads all three files.

- [ ] **Commit:** `feat(share-page): serve multi-page snapshots with working nav (Rules 4, 5, 6)`

> **CHECK-IN POINT** — Phase 6f complete. Confirm with user before continuing.

---

## Phase 6g — Wizard UI (Tasks 21–24)

### Task 21 — Wizard store: site + pages state

- [ ] **Goal:** The store knows the current site, its pages, and which page is active.

- [ ] **Files:** `src/lib/wizard/store.ts` (MODIFIED). Tests: extend `src/lib/wizard/__tests__/store.test.ts`.

- [ ] **Implementation notes:**
  - `WizardState` gains: `siteId: string | null`, `pages: Array<{ slug: string; title: string; artifactId: string; position: number }>`, `activeSlug: string`. Initial: `siteId: null, pages: [], activeSlug: '/'`.
  - New actions: `setSite(siteId, pages)`, `addPage(page)` (immutable append + sort by position), `setActiveSlug(slug)`, `setPageArtifact(slug, artifactId)` (immutable map), `removePage(slug)`.
  - `reset()` clears the new fields. `partialize` (store.ts:128-134) persists `siteId`, `pages`, `activeSlug`.
  - `hydrateAndValidate` extension: also drop pages whose artifactId no longer exists; if activeSlug's page was dropped → fall back to `/`.
  - `rounds` filtering stays artifact-chain based — `WizardRound` is unchanged; the iteration history component (Task 24) filters rounds to the active page's chain client-side.

- [ ] **Tests:** setSite/addPage/setActiveSlug/setPageArtifact/removePage immutability (original state object unchanged — Object.is assertions); reset clears; hydrateAndValidate drops orphan pages + falls back activeSlug; persistence partialize includes new keys.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean; existing store tests untouched and green.

- [ ] **Commit:** `feat(wizard): add site and page state to wizard store`

### Task 22 — Page switcher + AddPageModal

- [ ] **Goal:** The two new wizard components.

- [ ] **Files:** `src/app/wizard/_components/page-switcher.tsx` (NEW), `src/app/wizard/_components/add-page-modal.tsx` (NEW). Wire into `src/app/wizard/_components/step-generate.tsx` (MODIFIED — render PageSwitcher above the preview).

- [ ] **Implementation notes:**
  - **Read `create-share-modal.tsx` and `checkpoint-name-modal.tsx` first.** AddPageModal copies the `<dialog>` pattern verbatim (the `'cancel'`-event-only listener — M4 Finding 2 fix).
  - `page-switcher.tsx`: horizontal strip; mono uppercase labels per the editorial kicker pattern (project memory: kicker = mono uppercase tracking-[0.2em]); active page underlined with `--color-accent`; `+ Add page` ghost button at the end. Props: `{ pages, activeSlug, onSwitch, onAddPage }`. Hidden entirely when `pages.length === 0` (pre-generation).
  - `add-page-modal.tsx`: fields title (text input) / slug (text input, auto-filled from `deriveSlug(title)` on title blur, editable) / brief (textarea, 10–2000 chars with live count). Submit → `POST /api/site/<siteId>/page` consuming the SSE stream (copy the stream-consumption pattern from how step-generate calls `/api/generate`) → progress states (generating / injecting images / done) → on done: `addPage` + `setActiveSlug` in store, `onClose`. Error pane reuses modal error styling (`--color-danger` tokens).
  - Editorial kicker header per modal family convention: kicker "NEW PAGE", title from `--font-display`.
  - **Wizard preview nav injection (spec § 8.2):** wherever the preview iframe gets its `srcDoc` HTML (step-generate / side-by-side-preview), wrap it with `injectNav(html, store.pages, store.activeSlug)` before rendering — `nav-injector.ts` is pure and runs client-side. The preview's nav then always shows the current page set. (Deviation from spec § 8.2: the standalone `/preview/[id]` route does NOT inject nav — it is artifact-scoped, has no site context, and is an operator-only debug surface. It shows the raw markers' initial single link. Accepted simplification; revisit only if it bothers in practice.)

- [ ] **Tests:** None at component level (visual; covered by gate). Slug auto-derivation already unit-tested (Task 4).

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean; `pnpm build` passes. Manual dev: generate landing → switcher shows "Home" → Add page → modal generates → switcher shows both pages → switching swaps the preview.

- [ ] **Commit:** `feat(wizard): add page switcher and AddPageModal`

### Task 23 — FinishActions + CreateShareModal updates

- [ ] **Goal:** Contract download for the operator; share modal goes site-scoped.

- [ ] **Files:** `src/app/wizard/_components/finish-actions.tsx` (MODIFIED), `src/app/wizard/_components/create-share-modal.tsx` (MODIFIED).

- [ ] **Implementation notes:**
  - FinishActions: new ghost button "Design contract ↓" (ghost button pattern from project memory: border + transparent bg + ink-muted text). Opens a `<details>` menu with three links to `/api/site/<siteId>/contract?file=...`. Disabled (with tooltip "Generate a page first") when `siteId === null`.
  - CreateShareModal: POST body becomes `{ siteId, name }`; success state shows "Covers all N pages as they are right now" using `pages.length` from the store; default share name stays `${brief.projectName} — round ${activeRound.iterationRound}`.
  - The history-row share indicator (`iteration-history.tsx` Link2 icon) now matches shares by `share.siteId === store.siteId` instead of artifactId — update the `hasShares` predicate.

- [ ] **Tests:** None at component level.

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean; `pnpm build` passes. Manual: contract downloads from wizard; share created covers both pages (verify at `/s/<token>/about`).

- [ ] **Commit:** `feat(wizard): site-scoped sharing and operator contract download`

### Task 24 — Iteration history filtering + /shares page update

- [ ] **Goal:** History sidebar shows the active page's chain; /shares rows show site context.

- [ ] **Files:** `src/app/wizard/_components/iteration-history.tsx` (MODIFIED), `src/app/shares/_components/share-row.tsx` (MODIFIED), `src/app/shares/_components/shares-table.tsx` (MODIFIED if column headers change).

- [ ] **Implementation notes:**
  - iteration-history: filter `rounds` to those whose artifact chain belongs to the active page — a round belongs if `round.artifactId === activePage.artifactId` OR walking `parentArtifactId` links reaches the active page's root. Implement as pure helper `roundsForPage(rounds: WizardRound[], pageRootArtifactId: string): WizardRound[]` in `src/lib/wizard/rounds.ts` (NEW, unit-tested) — root = the round with `parentArtifactId === null` in that page's chain.
  - share-row: add site name + page count line ("SmokeYard · 3 pages") in mono small text under the share name. Requires `GET /api/share` response to include site names: modify the GET handler (Task 19 file) to join site names via `siteStore.getSite` (batch: dedupe siteIds, one getSite per unique id).
  - Empty-state copy on /shares updates: "Create one from the Finish panel after generating a site."

- [ ] **Tests:** `roundsForPage` unit tests: single chain; two independent chains (two pages) correctly separated; orphan rounds excluded.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean; `pnpm build` passes; `pnpm test` full suite green.

- [ ] **Commit:** `feat(wizard): per-page iteration history and site-aware /shares rows`

> **CHECK-IN POINT** — Phase 6g complete. This is the last code phase. Run the FULL local regression (all manual acceptance flows from Tasks 15–24) before deploy. Confirm with user before Phase 6h.

---

## Phase 6h — Deploy & Validation (Tasks 25–27)

### Task 25 — Vercel project + env vars + first deploy

- [ ] **Goal:** First production deploy. (Former M5 Task 19, unchanged except env var list.)

- [ ] **Files:** None — Vercel dashboard/CLI work.

- [ ] **Implementation notes:**
  - `pnpm dlx vercel link` → create project `frame-bucket`.
  - Env vars (production + preview): `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `NOTION_API_KEY`, `NOTION_DATA_SOURCE_AESTHETICS/LAYOUTS/INTERACTIONS/SYSTEMS`, `ADMIN_SECRET`, `DAILY_COST_ALERT_USD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FB_ARCHIVE_BACKEND=supabase`, `NEXT_PUBLIC_APP_URL=https://frame-bucket.vercel.app`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Deploy from `main` (merge `dev` → `main` first — this is the M6 release point).
  - Verify: `curl -I https://frame-bucket.vercel.app/` → 307 to `/admin`; after cookie login, wizard works.

- [ ] **Acceptance:** Prod URL live; admin gate works; one full site generated against prod Supabase (verify rows in `sites`, `site_pages`, `artifacts`).

- [ ] **Commit:** `chore(deploy): provision Vercel project and prod env vars`

### Task 26 — GitHub Actions for Supabase migrations

- [ ] **Goal:** Migrations auto-apply on push to `main`. (Former M5 Task 20, verbatim.)

- [ ] **Files:** `.github/workflows/db-migrate.yml` (NEW).

- [ ] **Implementation notes:** Trigger `on.push.branches: [main]`, `paths: ['supabase/migrations/**']`. Steps: checkout → `supabase/setup-cli@v1` → `supabase link --project-ref $SUPABASE_PROJECT_REF` → `supabase db push --linked`. GitHub secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.

- [ ] **Acceptance:** A no-op migration pushed to `main` triggers the workflow and lands in `supabase_migrations.schema_migrations`.

- [ ] **Commit:** `ci(supabase): apply migrations on main push`

### Task 27 — M6 validation gate

- [ ] **Goal:** Full end-to-end validation against prod. Produces the validations doc.

- [ ] **Files:** `docs/superpowers/validations/2026-06-XX-m6-sites-contracts.md` (NEW — use `2026-05-12-m4-wizard.md` as structural template).

- [ ] **Implementation notes:** Walk spec § 12 procedure items 1–10 in order against the prod URL. The 10 items: (1) landing gen creates site, (2) two subpages match design + nav on all pages, (3) contract download + Rule 7 grep check, (4) share with click-through nav, (5) iterate-after-share → share unchanged (snapshot), (6) second share shows new version, (7) recipient contract download without cookie, (8) revoke covers all slugs, (9) paste contract.md into fresh Claude → matching page (manual judgment), (10) Rules 1–9 cross-checks (curl tests from spec § 12 + M5 gate). Document findings with severity; fix High inline; re-run failed items.

- [ ] **Acceptance:** All 10 items pass (with documented findings/fixes); validations doc committed; spec § 12 updated to link the actual doc filename.

- [ ] **Commit:** `docs(validation): record M6 sites + contracts gate findings`

---

## Risks & Mitigations

Carried from spec § 13. Implementation-phase additions:

| Risk                                                               | Mitigation in this plan                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| ShareStore breaking change leaves repo untypecheckable mid-phase   | Task 13 transitional optional field; removed in Task 19 only after all callers updated                        |
| Route move (`[token]` → `[[...slug]]`) breaks stale Next validator | Task 20 explicitly cleans `.next/types/validator.ts` (known project gotcha)                                   |
| Subpage SSE endpoint diverges from generate's abort handling       | Task 17 copies the abort wiring verbatim + has explicit no-orphan tests                                       |
| Marker validation loops forever on retry                           | Exactly ONE retry, then hard error (Task 17)                                                                  |
| Wizard store schema change breaks persisted localStorage state     | `partialize` additions are additive; missing keys hydrate as initial values; hydrateAndValidate drops orphans |

---

## Build Order Summary

| Tasks | Phase                     | Outcome                                                                |
| ----- | ------------------------- | ---------------------------------------------------------------------- |
| 1–4   | 6a — Schema & site domain | Tables live; SiteStore (memory/fs/supabase/factory); slug utility      |
| 5–8   | 6b — Contract pipeline    | Extraction → narrative → assembly → cached derive orchestrator         |
| 9–12  | 6c — Nav & prompts        | Nav injector, link rewriter, marker instructions, subpage assembler    |
| 13–14 | 6d — Share domain         | Site-scoped snapshot shares (memory + supabase)                        |
| 15–19 | 6e — API routes           | Generate/iterate site-aware; subpage + contract + share endpoints      |
| 20    | 6f — Share viewer         | Catch-all route, working nav, recipient contract download              |
| 21–24 | 6g — Wizard UI            | Store, page switcher, add-page modal, finish actions, history, /shares |
| 25–27 | 6h — Deploy & validation  | First prod deploy; migrations CI; full validation gate                 |

**Estimated implementation time** (subagent-driven, two-stage review): ~20–25 hours of agent time.

**Estimated cost of validation runs:** ~$15–25 in generation tokens (per spec § 14).

When all 27 tasks land green and the validation gate passes, M6 is done and Frame Bucket is live in production. M6b (page reordering, zip bundles, per-page view tracking) or M7 (Supabase Auth + RLS) follows.
