# Frame Bucket — M5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first deployed Frame Bucket with unlisted share URLs (`/s/<token>`) backed by Supabase Postgres, a `/shares` management page (rename/revoke/last-viewed), and an `ADMIN_SECRET` cookie gate covering everything except the share surface. Replaces the local-filesystem-only archive with a pluggable backend (filesystem in dev, Supabase in prod) so the M4 dev flow keeps working unchanged.

**Architecture deltas from M4:** Existing `ArchiveStore` class becomes one of two implementations behind a new interface; a factory picks by `FB_ARCHIVE_BACKEND` env var. New `shares/` module owns per-share tokens (not per-artifact). One new viewer route (`/s/[token]`), one new author route (`/shares`), four new API endpoints. One new middleware. Vercel + Supabase deploy via GitHub Actions for migrations.

**Tech Stack:** Existing — Next.js 16.2.4 (Turbopack), React 19, Zustand 5, Zod 4. New dep — `@supabase/supabase-js`. Token generation is hand-rolled (~20 lines, no `nanoid` dependency).

**Related spec:** `docs/superpowers/specs/2026-05-16-frame-bucket-m5-design.md`

**Scope boundary:** M5 only. M5b (export-to-static, embed codes, search/sort/bulk on `/shares`, share TTL, OG unfurl), M6 (Supabase Auth + real RLS), M7 (a11y/perf/mobile), M8 (custom domain) follow.

---

## File Structure Map

Only new and modified files. Everything else from M0–M4 unchanged. See spec § 4 for visual tree.

```
supabase/                            — NEW
  config.toml
  migrations/20260516000000_m5_init.sql
.github/workflows/db-migrate.yml     — NEW
scripts/check-no-key-leak.ts         — NEW
src/middleware.ts                    — NEW
src/lib/generation/
  archive.ts                         — MODIFIED (class rename)
  archive-interface.ts               — NEW
  archive-supabase.ts                — NEW
  archive-factory.ts                 — NEW
src/lib/shares/                      — NEW module
  share-store.ts, share-store-supabase.ts, share-store-memory.ts,
  share-store-factory.ts, token.ts, view-tracking.ts, __tests__/
src/lib/supabase/                    — NEW
  client-server.ts, client-browser.ts, env.ts, database.types.ts
src/app/s/[token]/                   — NEW
  page.tsx, revoked-view.tsx, share-footer.tsx, not-found.tsx
src/app/shares/                      — NEW
  page.tsx, _components/{shares-table,share-row,revoke-confirm}.tsx
src/app/api/share/                   — NEW
  route.ts, [token]/route.ts
src/app/wizard/_components/
  finish-actions.tsx                 — MODIFIED
  create-share-modal.tsx             — NEW
  iteration-history.tsx              — MODIFIED
.env.example, package.json           — MODIFIED
```

---

## Cost & Cache Strategy

M5 adds no net new Anthropic spend. M3/M4 cache discipline preserved by construction — system blocks still cache; only the archive's backing store changes. New runtime costs: Supabase (free tier OK through ~50 artifacts; Pro at $25/mo after) and Vercel Hobby (free).

---

## Cross-Cutting Rules

All M3/M4 rules apply. M5 adds three more (spec § 7 for full reasoning):

- **Rule 1** (M3 carry-forward) — Client never sends HTML to `/api/iterate`.
- **Rule 2** (M4 carry-forward) — Mounting a step never fires the same API call twice under StrictMode.
- **Rule 3** — Service role key never reaches the browser. `SUPABASE_SERVICE_ROLE_KEY` imported only from files with `import 'server-only'`. CI script greps `.next/static/` post-build.
- **Rule 4** — Tokens validated server-side before any DB lookup. All `[token]` handlers call `isValidToken(s)` first; misshapen → 404 with zero Postgres contact.
- **Rule 5** — View tracking never blocks share-page render. `void trackView(...)` is fire-and-forget, try/catch'd, throttled via 5-minute buckets.

Every task touching a route, Supabase call, or token handler must cite which rule applies. Task 21 (validation gate) re-checks all five end-to-end.

---

## Phase 5a — Backend Infrastructure (Tasks 1–6)

### Task 1 — Supabase project + local CLI setup

- [ ] **Goal:** Provision the `frame-bucket-prod` Supabase project (region `us-east-1`), init the local Supabase CLI, document new env vars. No app code changes.

- [ ] **Files:** `supabase/config.toml` (NEW via `supabase init`), `.env.example` (MODIFIED), `package.json` (MODIFIED — add `db:types`, `db:push`, `db:diff` scripts).

- [ ] **Implementation notes:**
  - Install Supabase CLI; `supabase init` in repo root; `supabase link --project-ref <ref>`.
  - Add to `.env.example` and copy to `.env.local`:
    ```
    SUPABASE_URL=https://<ref>.supabase.co
    SUPABASE_ANON_KEY=eyJ...
    SUPABASE_SERVICE_ROLE_KEY=eyJ...           # SECRET — server-only (Rule 3)
    FB_ARCHIVE_BACKEND=fs                       # `fs` (default) or `supabase`
    NEXT_PUBLIC_APP_URL=http://localhost:3000
    NEXT_PUBLIC_SUPABASE_URL=...                # mirror of SUPABASE_URL for client bundle
    NEXT_PUBLIC_SUPABASE_ANON_KEY=...
    ```
  - Scripts: `db:types` runs `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`; `db:push` runs `supabase db push --linked`; `db:diff` runs `supabase db diff --linked`.

- [ ] **Tests:** None — setup task.

- [ ] **Acceptance:** `supabase status` shows linked ref; `.env.example` has new entries; `pnpm db:diff` runs cleanly.

- [ ] **Commit:** `chore(supabase): init local CLI and document M5 env vars`

### Task 2 — Initial migration (artifacts + shares + view buckets)

- [ ] **Goal:** Author and apply the M5 migration creating three tables. RLS stays disabled per spec § 5.2.

- [ ] **Files:** `supabase/migrations/20260516000000_m5_init.sql` (NEW).

- [ ] **Implementation notes:** Migration SQL is the verbatim block from spec § 5.1. Three tables: `artifacts(id text PK, html text, html_source text, meta jsonb, parent_id text FK, iteration_round int, created_at)`; `shares(token text PK, artifact_id text FK, name text checked 1..120, revoked_at, last_viewed_at, view_count int, created_at)`; `share_view_buckets(token text FK, bucket_started_at timestamptz, PK(token, bucket_started_at))`. Indexes per spec. Apply with `pnpm db:push`. Verify in Supabase SQL editor: `select table_name from information_schema.tables where table_schema = 'public';` returns the three tables.

- [ ] **Tests:** SQL smoke test above.

- [ ] **Acceptance:** Migration file matches spec verbatim; `pnpm db:push` succeeds; tables visible in dashboard.

- [ ] **Commit:** `feat(db): add M5 initial migration — artifacts, shares, view buckets`

### Task 3 — Supabase clients + env validation + Rule 3 setup

- [ ] **Goal:** Two typed Supabase clients (server with service role; browser with anon key), a Zod env validator, and the build-time leak-check script. Establishes Rule 3 in three layers: `import 'server-only'`, naming convention, and the grep script.

- [ ] **Files:** `src/lib/supabase/{env.ts, client-server.ts, client-browser.ts, database.types.ts}` (all NEW; database.types.ts generated by `pnpm db:types`). `scripts/check-no-key-leak.ts` (NEW). `package.json` (add `@supabase/supabase-js` dep; add `check:no-leak` script). Tests: `src/lib/supabase/__tests__/env.test.ts`.

- [ ] **Implementation notes:**
  - `env.ts` exports a Zod `ServerEnvSchema` covering `SUPABASE_URL` (url), `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FB_ARCHIVE_BACKEND` (enum `'fs' | 'supabase'`, default `'fs'`), `NEXT_PUBLIC_APP_URL` (url). `readServerEnv()` parses `process.env`.
  - `client-server.ts` starts with `import 'server-only';` (load-bearing for Rule 3 — Next 16 errors at build if a `'use client'` file imports it). Exports `supabaseServer()` that caches a `createClient<Database>(...)` instance with the service role key; `auth: { persistSession: false, autoRefreshToken: false }`.
  - `client-browser.ts` exports `supabaseBrowser()` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. M5 doesn't actually use this client (it's prebuilt for M6 auth).
  - Generate types: `pnpm db:types`. Commit the generated `database.types.ts` (not gitignored — keeps fresh-clone type-checking working).
  - `scripts/check-no-key-leak.ts` (Rule 3 third layer): a small `tsx` script that walks `.next/static/` recursively and reads each file as text; fails (exit code 1) if any file contains either the literal string `SUPABASE_SERVICE_ROLE_KEY` (the env var name — should never appear in client bundles since Next 16 strips non-`NEXT_PUBLIC_` env access from client output) or the actual key value from `process.env.SUPABASE_SERVICE_ROLE_KEY` if set. Use `node:fs/promises` walks; ignore source maps unless `--include-maps` is passed. Print the offending file path on failure.
  - Add `package.json` script: `"check:no-leak": "tsx scripts/check-no-key-leak.ts"`.

- [ ] **Tests:** `env.ts` returns parsed env when all set; throws when URL malformed; throws when service-role key missing; `FB_ARCHIVE_BACKEND` defaults to `'fs'` when unset. For `check-no-key-leak.ts`, manually verify: (a) run after `pnpm build` on clean code → exit 0; (b) temporarily inline the env var name into a client component, `pnpm build`, run script → exit 1 with the offending file path; revert.

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean; `pnpm test src/lib/supabase` passes. Verify Rule 3 layer 1: temporarily import `supabaseServer` from a `'use client'` file and run `pnpm build` — should error. Revert. Verify Rule 3 layer 3: `pnpm build && pnpm check:no-leak` exits 0.

- [ ] **Commit:** `feat(supabase): add typed clients, env validation, and build-time leak guard (Rule 3)`

### Task 4 — Extract `ArchiveStore` interface; rename existing class

- [ ] **Goal:** Lift the existing `ArchiveStore` class's public API into an interface. Rename the concrete class to `FilesystemArchiveStore`. Zero behavior change — all M3/M4 callers keep working.

- [ ] **Files:** `src/lib/generation/archive-interface.ts` (NEW). `src/lib/generation/archive.ts` (MODIFIED — rename class, implement interface). Any file importing `ArchiveStore` as a type updated to use the interface module.

- [ ] **Implementation notes:**
  - `archive-interface.ts` exports an `ArchiveStore` interface with five methods: the four existing (`save`, `exists`, `read`, `getChildren`) PLUS a new `existsMany(ids: string[]): Promise<Set<string>>` (returns the subset of ids that exist). The new method addresses spec § 14 open question #2 — the wizard hydrator already POSTs a batch of artifact IDs to `/api/artifact/exists`, but the server fans out per-ID. `existsMany` lets the Supabase backend do a single `.in()` query instead of N parallel queries. Re-export the `ArchiveRecord` type from `archive.ts` so callers have one import path.
  - In `archive.ts`: rename `class ArchiveStore` → `class FilesystemArchiveStore implements ArchiveStore`. Add a trivial `existsMany` implementation: `return new Set((await Promise.all(ids.map(async (id) => ({ id, e: await this.exists(id) })))).filter((r) => r.e).map((r) => r.id));`. Filesystem `exists` is cheap so parallel fan-out is fine. Keep the existing `defaultArchiveStore()` shim returning a `FilesystemArchiveStore` — Task 6 replaces this with the real factory.
  - Run `grep -rn "ArchiveStore" src/` and update _type_ imports to point at `archive-interface.ts`. Imports of `defaultArchiveStore()` still point at `archive.ts` (the re-export from Task 6 will keep this stable).

- [ ] **Tests:** Existing `src/lib/generation/__tests__/archive.test.ts` (if present) keeps passing unedited. Add a tiny compile-time assertion: importing `ArchiveStore` from the interface module and assigning a `FilesystemArchiveStore` instance to it type-checks.

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean; all generation tests pass; `pnpm dev` serves wizard with no console errors.

- [ ] **Commit:** `refactor(archive): extract ArchiveStore interface; rename concrete to FilesystemArchiveStore`

### Task 5 — `SupabaseArchiveStore` implementation

- [ ] **Goal:** Supabase-backed implementation of the `ArchiveStore` interface. CRUD against `artifacts` table.

- [ ] **Files:** `src/lib/generation/archive-supabase.ts` (NEW). Tests: `src/lib/generation/__tests__/archive-supabase.test.ts`.

- [ ] **Implementation notes:**
  - Class `SupabaseArchiveStore implements ArchiveStore`. Calls `supabaseServer()` per operation (cached client is fine).
  - `save`: generates id via `crypto.randomUUID()`. Computes `recipeSummary` with `(iter N)` suffix matching the existing `FilesystemArchiveStore` logic (extract the helper if cleanest). Inserts a row with `{ id, html, html_source, meta, parent_id, iteration_round }`. `meta` is the jsonb column holding model info: `{ recipeSummary, modelId, inputTokens, outputTokens, cacheReadTokens, cost, generatedAt }`. Throws on Supabase error.
  - `exists`: `.select('id', { count: 'exact', head: true }).eq('id', id)` — head-only count, no row body.
  - `existsMany(ids: string[])`: `.select('id').in('id', ids)` — single round-trip; returns `new Set(data.map(r => r.id))`. Empty input → return empty Set without querying.
  - `read`: `.select('*').eq('id', id).maybeSingle()`. Maps row → `ArchiveRecord` via a private `rowToRecord` helper that unpacks `meta` jsonb.
  - `getChildren`: `.select('*').eq('parent_id', parentId).order('iteration_round', { ascending: true })`.
  - Mock `supabaseServer()` in tests via `vi.mock` — never hit real Supabase in unit tests (covered by validation gate).

- [ ] **Tests:** `save` happy path returns id; `save` propagates Supabase errors; `read` happy + null cases; `exists` true/false; `existsMany` returns correct subset (empty input → empty Set; partial match → only matching ids; all match; none match); `getChildren` sorted by iteration_round; uses mocked `supabaseServer`.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean; module never imports `'server-only'` directly (transitively guarded via `supabaseServer`).

- [ ] **Commit:** `feat(archive): add SupabaseArchiveStore against artifacts table`

### Task 6 — Archive factory + swap `defaultArchiveStore()` to use it

- [ ] **Goal:** Factory selects backend by `FB_ARCHIVE_BACKEND`. Replace the shim in `archive.ts` so existing callers transparently get the right backend.

- [ ] **Files:** `src/lib/generation/archive-factory.ts` (NEW). `src/lib/generation/archive.ts` (MODIFIED — replace shim with re-export from factory). Tests: `src/lib/generation/__tests__/archive-factory.test.ts`.

- [ ] **Implementation notes:**
  - Factory caches a single store instance per process. `defaultArchiveStore()` reads `process.env.FB_ARCHIVE_BACKEND`: `'supabase'` → `new SupabaseArchiveStore()`; `'fs'` or unset → `new FilesystemArchiveStore(path.join(process.cwd(), 'tmp', 'generations'))`.
  - Export `_resetArchiveStoreCacheForTests()` for test isolation (production code never calls it).
  - In `archive.ts`: remove the existing `defaultArchiveStore` function; `export { defaultArchiveStore } from './archive-factory';` so import paths stay stable.
  - **Also update `src/app/api/artifact/exists/route.ts`** in this task: replace the existing `Promise.all(ids.map(id => archive.exists(id)))` block with a single `await archive.existsMany(ids)` call. Returns the same `{ existing: string[] }` shape — just convert the Set back via `Array.from(set)`. This is what makes wizard hydration efficient under the Supabase backend (spec § 14 #2).

- [ ] **Tests:** Unset env → returns `FilesystemArchiveStore`; `'fs'` same; `'supabase'` → `SupabaseArchiveStore`; calls cache (same instance); reset clears cache. Use `vi.stubEnv` + `_resetArchiveStoreCacheForTests()` per case. Existing tests for `/api/artifact/exists` (if any) keep passing — same wire shape.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean; `pnpm dev` still works (env unset → fs → M4 flow intact). Manual: set `FB_ARCHIVE_BACKEND=supabase` in `.env.local`, restart dev, generate one artifact, confirm row appears in `artifacts` via Supabase SQL editor. Then **unset** for fast dev iteration in subsequent tasks.

- [ ] **Commit:** `feat(archive): add backend factory selecting fs vs supabase by env var`

---

## Phase 5b — Shares Domain (Tasks 7–10)

### Task 7 — Token generator + validator (Rule 4)

- [ ] **Goal:** A pure, fully-tested module for generating 16-char base62 tokens and validating arbitrary strings. Rule 4 lives here.

- [ ] **Files:** `src/lib/shares/token.ts` (NEW). Tests: `src/lib/shares/__tests__/token.test.ts`.

- [ ] **Implementation notes:**
  - `ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'` (62 chars).
  - `TOKEN_LENGTH = 16`; `TOKEN_REGEX = /^[A-Za-z0-9]{16}$/`.
  - `generateShareToken()`: `crypto.randomBytes(16)`, map each byte through `ALPHABET[byte % 62]`. Modulo bias is negligible at this length (62 fits in 6 bits, byte is 8) — not a security concern for the per-token unguessability bar.
  - `isValidToken(s: unknown): s is string` returns `typeof s === 'string' && TOKEN_REGEX.test(s)`.

- [ ] **Tests:** `generateShareToken()` returns 16-char base62 string; produces different output across 1000 calls; `isValidToken` rejects empty / wrong length / dash / underscore / unicode / null / undefined; accepts valid; round-trip `isValidToken(generateShareToken())` is true.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(shares): add unguessable token generator and shape validator (Rule 4)`

### Task 8 — `ShareStore` interface + `MemoryShareStore` implementation

- [ ] **Goal:** Define the share store contract. Implement an in-memory backend for unit tests and dev fallback.

- [ ] **Files:** `src/lib/shares/share-store.ts` (NEW — interface + ShareRecord type). `src/lib/shares/share-store-memory.ts` (NEW). Tests: `src/lib/shares/__tests__/share-store-memory.test.ts`.

- [ ] **Implementation notes:**
  - `ShareRecord` interface: `{ token, artifactId, name, revokedAt: string | null, lastViewedAt: string | null, viewCount: number, createdAt: string }`. Use ISO strings, not Date objects — easier to serialize across the API boundary.
  - `ShareStore` interface methods (all async): `create({ artifactId, name }) → ShareRecord`; `findByToken(token) → ShareRecord | null`; `list() → ShareRecord[]`; `rename(token, name) → ShareRecord | null`; `revoke(token) → ShareRecord | null` (idempotent: keeps existing `revoked_at` if already set); `trackViewIfNotRecent(token, windowMs) → boolean` (true if a new view was recorded, false if throttled / missing / revoked).
  - `MemoryShareStore`: `Map<string, MemoryRow>` keyed by token; `MemoryRow extends ShareRecord` with `viewBuckets: Set<number>` for throttling. `create` calls `generateShareToken()` from Task 7. `trackViewIfNotRecent` floors `Date.now() / windowMs` and stores in `viewBuckets`.

- [ ] **Tests:** `create` returns valid token + initial state; `findByToken` null for missing; `list` orders by createdAt desc; `rename` updates + null for missing; `revoke` sets timestamp + idempotent; `trackViewIfNotRecent`: first call true and bumps count; second in same window false; later window true; revoked false; missing false. Use `vi.useFakeTimers()` + `vi.setSystemTime()` for bucket boundaries.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(shares): add ShareStore interface and MemoryShareStore`

### Task 9 — `SupabaseShareStore` implementation

- [ ] **Goal:** Production share store backed by Supabase Postgres. Same contract as `MemoryShareStore`. Uses `share_view_buckets` for throttled view tracking.

- [ ] **Files:** `src/lib/shares/share-store-supabase.ts` (NEW). Tests: `src/lib/shares/__tests__/share-store-supabase.test.ts`.

- [ ] **Implementation notes:**
  - Class `SupabaseShareStore implements ShareStore`. Uses `supabaseServer()` per operation.
  - `create`: insert row with generated token, return mapped record.
  - `findByToken`: `.select('*').eq('token', token).maybeSingle()`.
  - `list`: `.select('*').order('created_at', { ascending: false })`.
  - `rename`: `.update({ name }).eq('token', token).select('*').maybeSingle()`.
  - `revoke` (M5 keeps this simple — no Postgres function, just SELECT-then-UPDATE):
    1. `findByToken(token)` — null → return null.
    2. If `revokedAt` already set → return existing.
    3. `.update({ revoked_at: new Date().toISOString() }).eq('token', token).select('*').maybeSingle()`.
  - `trackViewIfNotRecent(token, windowMs)`:
    1. Compute bucket: `new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString()`.
    2. INSERT into `share_view_buckets` with `{ token, bucket_started_at: bucket }`. If error code `23505` (unique violation) → return false (throttle hit). Other errors propagate.
    3. On successful insert: bump `view_count` and `last_viewed_at` on `shares`. If this update fails, swallow (the bucket row is the source of truth; counter drift is acceptable per Rule 5 — failures never propagate).
  - Reuse the same mocked-supabase pattern from Task 5.

- [ ] **Tests:** Same surface as `MemoryShareStore` (Task 8). Plus: `revoke` is idempotent (second call returns original `revoked_at`); `trackViewIfNotRecent` returns false on 23505; returns true on successful insert + update; returns true even if the bump-counter update fails (Rule 5 invariant).

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(shares): add SupabaseShareStore with throttled view tracking`

### Task 10 — Share-store factory + view tracking utility (Rule 5)

- [ ] **Goal:** Factory selecting memory vs Supabase by the same `FB_ARCHIVE_BACKEND` env var. Fire-and-forget view tracking with bot/prefetch filtering.

- [ ] **Files:** `src/lib/shares/share-store-factory.ts` (NEW). `src/lib/shares/view-tracking.ts` (NEW). Tests: `src/lib/shares/__tests__/view-tracking.test.ts` and `share-store-factory.test.ts`.

- [ ] **Implementation notes:**
  - Factory: same cached-singleton pattern as `archive-factory.ts` from Task 6. Use the SAME env var (`FB_ARCHIVE_BACKEND`) — both stores live in the same Supabase project, selecting them independently makes no sense.
  - `view-tracking.ts`:
    - Constants: `BOT_UA_RE = /(slackbot|twitterbot|discordbot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|googlebot|bingbot|duckduckbot)/i`. `VIEW_WINDOW_MS = 5 * 60 * 1000`.
    - `trackView(store, token, headers)`: returns `Promise<void>` resolved synchronously; spawns inner `doTrack(...)` with `void`.
    - `doTrack`: try/catch wraps everything. Skip if UA matches `BOT_UA_RE`. Skip if `purpose === 'prefetch'` or `sec-fetch-purpose === 'prefetch'`. Else await `store.trackViewIfNotRecent(token, VIEW_WINDOW_MS)`. Catch → `console.error('[view-tracking] failed', ...)`; no re-throw (Rule 5).
    - Export `_internals = { BOT_UA_RE, VIEW_WINDOW_MS }` for tests.

- [ ] **Tests:** view-tracking: with mock store throwing → `trackView` still resolves (Rule 5 invariant); bot UAs (`Slackbot 1.0`, `Twitterbot/1.0`, etc.) → no store call; prefetch header → no store call; normal UA → store called once. factory: default + `'fs'` → `MemoryShareStore`; `'supabase'` → `SupabaseShareStore`; caching works.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(shares): add share-store factory and fire-and-forget view tracking (Rule 5)`

---

## Phase 5c — API Routes (Tasks 11–13)

### Task 11 — `POST /api/share` and `GET /api/share`

- [ ] **Goal:** Create-share and list-shares endpoints. Zod-validated. Returns absolute share URLs built from `NEXT_PUBLIC_APP_URL`.

- [ ] **Files:** `src/app/api/share/route.ts` (NEW). Tests: `src/app/api/share/__tests__/route.test.ts`.

- [ ] **Implementation notes:**
  - Export `POST(req)` and `GET()` as named functions (Next 16 dispatches by method).
  - Body schema (Zod): `CreateBody = z.object({ artifactId: z.string().min(1), name: z.string().min(1).max(120).trim() })`.
  - `POST`:
    1. Parse JSON; safeParse via schema; 400 INVALID on either failure.
    2. `defaultArchiveStore().exists(artifactId)` → 404 NOT_FOUND if false.
    3. `defaultShareStore().create({ artifactId, name })`.
    4. Build absolute URL: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/s/${share.token}`.
    5. Return `{ token, url, name, createdAt }`.
  - `GET`: return `{ shares: await defaultShareStore().list() }`. No pagination in M5.
  - Standard error envelope: `{ ok: false, error: { code, message } }` matching `/api/generate`.

- [ ] **Tests:** POST rejects malformed JSON, missing fields, name > 120; 404 when archive `exists` false; 200 with full payload on success; URL uses `NEXT_PUBLIC_APP_URL`. GET returns empty + populated list. Use `MemoryShareStore` and mock archive-factory.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean.

- [ ] **Commit:** `feat(api): add POST /api/share (create) and GET /api/share (list)`

### Task 12 — `PATCH /api/share/[token]` and `DELETE /api/share/[token]` (Rule 4)

- [ ] **Goal:** Rename and revoke endpoints. Rule 4 applies — validate token before any store call.

- [ ] **Files:** `src/app/api/share/[token]/route.ts` (NEW). Tests: `src/app/api/share/[token]/__tests__/route.test.ts`.

- [ ] **Implementation notes:**
  - Export `PATCH(req, { params })` and `DELETE(req, { params })`. `params` is a Promise in Next 16 — `await params` first.
  - First line of both handlers: `if (!isValidToken(token)) return errorResponse(404, 'NOT_FOUND', 'Share not found');`. This is the Rule 4 enforcement point.
  - `PATCH`: Zod-validate `{ name: z.string().min(1).max(120).trim() }`; call `store.rename(token, name)`; 404 if null; return `{ share: updated }`.
  - `DELETE`: call `store.revoke(token)`; 404 if null; return `{ share: revoked }`. Idempotent — second DELETE returns the same `revoked_at` as first.

- [ ] **Tests:** PATCH and DELETE both: invalid token shape → 404 _and_ store method is NOT called (verify with mock spy — this is the Rule 4 acceptance test); missing share → 404; PATCH name validation; PATCH success returns updated; DELETE success returns revoked; DELETE re-revoke is idempotent.

- [ ] **Acceptance:** Tests pass; `pnpm tsc --noEmit` clean. Mock spy on `store.rename`/`store.revoke` confirms zero calls for invalid tokens.

- [ ] **Commit:** `feat(api): add PATCH and DELETE on /api/share/[token] (Rule 4)`

### Task 13 — Viewer-facing share page `/s/[token]`

- [ ] **Goal:** Server-component share page with three states (active, revoked, 404). Full-bleed sandboxed iframe + tiny footer. Fire-and-forget view tracking.

- [ ] **Files:** `src/app/s/[token]/{page.tsx, share-footer.tsx, revoked-view.tsx, not-found.tsx}` (all NEW).

- [ ] **Implementation notes:**
  - `page.tsx` (server component):
    1. Export `metadata: Metadata = { robots: { index: false, follow: false } }`.
    2. `const { token } = await params;` → `if (!isValidToken(token)) notFound();` (Rule 4).
    3. `share = await defaultShareStore().findByToken(token)` → `if (!share) notFound();`.
    4. If `share.revokedAt`: render `<RevokedView name={share.name} revokedAt={share.revokedAt} />` + footer.
    5. `artifact = await defaultArchiveStore().read(share.artifactId)` → if null: render `<RevokedView reason="missing" />` + footer.
    6. Fire-and-forget: `void trackView(defaultShareStore(), token, await headers())` (Rule 5 — never awaited).
    7. Return `<main className="relative h-screen w-screen overflow-hidden">` with `<iframe srcDoc={artifact.html} sandbox="allow-scripts">` (matches `/preview/[id]` model) + `<ShareFooter />`.
  - `share-footer.tsx`: `<a href="/">` fixed bottom-right, 12px, `Fraunces` italic, `oklch(80% 0 0)` with `mix-blend-mode: difference` for legibility over both light and dark artifacts. Text: `Made with Frame Bucket ↗`.
  - `revoked-view.tsx`: full-screen grid-centered text. If `reason === 'missing'`: "This preview is no longer available." Else: "This preview was removed by the person who shared it."
  - `not-found.tsx`: full-screen grid-centered "This preview doesn't exist."
  - Security headers (`Content-Security-Policy: frame-ancestors 'none'`, `X-Robots-Tag`) added in middleware (Task 18), not in this page component.

- [ ] **Tests:** None at component level (server-component testing is awkward; full coverage in Task 21 validation gate).

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean. Manual: with `FB_ARCHIVE_BACKEND=supabase` set + a share created via curl against `/api/share`, visit `/s/<token>` — artifact full-bleed with footer. Invalid token in URL → 404.

- [ ] **Commit:** `feat(share-page): add viewer-facing /s/[token] with revoked + 404 states (Rules 4, 5)`

---

## Phase 5d — Wizard UI Integration (Tasks 14–16)

### Task 14 — `CreateShareModal` component

- [ ] **Goal:** Modal for creating (and renaming) a share. Reuses the M4 checkpoint-name-modal pattern verbatim to avoid the StrictMode flicker from M4 Finding 2.

- [ ] **Files:** `src/app/wizard/_components/create-share-modal.tsx` (NEW).

- [ ] **Implementation notes:**
  - **Read `checkpoint-name-modal.tsx` first.** Copy its `<dialog>` open/close pattern verbatim: listen for `'cancel'` event (Esc-only) — NOT `'close'`. Cancel/Save/backdrop handlers call `onClose` directly, never `dialog.close()`. This is the M4 Finding 2 fix.
  - Props: `{ open: boolean, onClose: () => void, artifactId: string, defaultName: string, editingToken?: string }`. When `editingToken` is set, the modal is in rename mode — calls `PATCH /api/share/[token]` instead of POST; button label changes from "Create share" to "Save".
  - Internal state: `name`, `submitting`, `error`, `createdUrl`. On successful POST, swap modal contents to the "Share link created" state with copy-to-clipboard URL + "Done" button calling `onClose`.
  - Copy button uses `navigator.clipboard.writeText(createdUrl)`.

- [ ] **Tests:** None at component level (covered by Task 21).

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean. Smoke test in dev: render in `/generate-test` temporarily; verify no flicker under StrictMode.

- [ ] **Commit:** `feat(wizard): add CreateShareModal reusing M4 dialog pattern`

### Task 15 — Update `FinishActions` to add "Create share link" CTA

- [ ] **Goal:** Promote "Create share link" to primary accent-blue CTA. Demote "Open standalone" and "Start a new project" to text links. Wire up the modal from Task 14.

- [ ] **Files:** `src/app/wizard/_components/finish-actions.tsx` (MODIFIED).

- [ ] **Implementation notes:**
  - Read current `finish-actions.tsx` first. Add `const [shareOpen, setShareOpen] = useState(false);`.
  - Compute default share name from wizard store: `${brief.projectName} — round ${activeRound.iterationRound}`.
  - Primary button: accent-blue (matches commit `28236ee` convention), opens modal. Disabled when no active artifact.
  - "Open standalone" and "Start a new project" become text links below the primary CTA, separated by `·`.
  - Pass `artifactId={activeArtifact.id}` and `defaultName={...}` to `<CreateShareModal />`.

- [ ] **Tests:** None.

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean. Dev (with `FB_ARCHIVE_BACKEND=supabase`): generate → click Create share → modal shows → save → URL displayed with copy button.

- [ ] **Commit:** `feat(wizard): promote Create share link to primary CTA in FinishActions`

### Task 16 — History sidebar "has shares" indicator

- [ ] **Goal:** Show a `Link2` icon next to a history row when the artifact has at least one non-revoked share. Click → `/shares`.

- [ ] **Files:** `src/app/wizard/_components/iteration-history.tsx` (MODIFIED).

- [ ] **Implementation notes:**
  - On wizard mount, fetch `GET /api/share`, store in local state (or hoist to a Zustand selector if cleaner). Refetch on demand after successful Create-share.
  - For each row: `hasShares = shares.some(s => s.artifactId === row.artifactId && !s.revokedAt)`.
  - When true, render `<Link2 className="h-3 w-3 ..." />` from `lucide-react`. Tooltip: "Has active share(s)". Wrap in a `<Link href="/shares">`.
  - Pass a `refreshShares` callback from `iteration-history.tsx` → `finish-actions.tsx` → `create-share-modal.tsx`'s success path. Cheapest: prop drilling.

- [ ] **Tests:** None.

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean. Manual: create a share → icon appears next to that round. Revoke via /shares (Task 17) → refresh wizard → icon goes away.

- [ ] **Commit:** `feat(wizard): show share indicator on history rows with active shares`

---

## Phase 5e — `/shares` Management Page (Task 17)

### Task 17 — `/shares` page with table, rename, revoke

- [ ] **Goal:** Standalone author-facing page. Table of shares with name, URL fragment, created, view count, last viewed, rename, revoke. Reuses `CreateShareModal` in edit mode.

- [ ] **Files:** `src/app/shares/page.tsx` (NEW). `src/app/shares/_components/{shares-table.tsx, share-row.tsx, revoke-confirm.tsx}` (all NEW).

- [ ] **Implementation notes:**
  - `page.tsx` (server component): fetch `GET /api/share` server-side with `cache: 'no-store'`. Pass to `<SharesTable />` (client component).
  - `shares-table.tsx`: split shares into active + revoked, render active first, revoked at bottom with muted styling.
  - `share-row.tsx`: name, last 4 chars of token + copy button (copies full URL), relative-time created, view count, relative-time last viewed (or "—"), Rename + Revoke action buttons. For revoked rows: hide Rename; show "Revoked Xd ago" instead of last viewed.
  - Rename: opens `<CreateShareModal editingToken={token} defaultName={current name} ...>`. On save → `PATCH /api/share/[token]` → router.refresh().
  - Revoke: opens `<RevokeConfirm />` (small inline confirm: "Recipients will see 'This preview was removed.' Continue?") → `DELETE /api/share/[token]` → router.refresh().
  - Empty state: "No shares yet. Create one from the Finish panel after generating an artifact."
  - No live polling; refresh is full `router.refresh()`.

- [ ] **Tests:** None at component level.

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean. Manual flow in dev (with `FB_ARCHIVE_BACKEND=supabase`):
  - Visit `/shares` → empty state.
  - Create share via wizard → refresh `/shares` → row appears.
  - Rename → modal opens with current name → save → row updates.
  - Revoke → confirm → row moves to revoked styling.
  - Open share URL in private window → "This preview was removed".

- [ ] **Commit:** `feat(shares): add /shares management page with rename and revoke`

---

## Phase 5f — Auth Middleware (Task 18)

### Task 18 — `ADMIN_SECRET` cookie middleware

- [ ] **Goal:** Single middleware gates everything in prod except `/s/*`, `/admin/login`, `/api/admin/login`, and Next.js static assets. Dev (`NODE_ENV !== 'production'`) no-ops. Adds Rule-related security headers to share-page responses.

- [ ] **Files:** `src/middleware.ts` (NEW).

- [ ] **Implementation notes:**
  - **Read `src/app/admin/page.tsx` and `src/app/admin/login.tsx` first** to confirm the existing cookie name (likely `admin_token`; verify). Reuse the same name and the same `=== process.env.ADMIN_SECRET` validation.
  - Export `middleware(req: NextRequest)`:
    1. If `process.env.NODE_ENV !== 'production'` → call `addShareHeaders` then `NextResponse.next()`. (Dev no-op except for share headers.)
    2. Compute `isPublic`: pathname starts with any of `/s/`, `/admin/login`, `/api/admin/login`; pathname matches `/_next/`, `/favicon`, `/robots.txt`, `/sitemap.xml`; pathname is exactly `/`.
    3. If public → `addShareHeaders` then `NextResponse.next()`.
    4. Read `req.cookies.get('admin_token')?.value`. If missing or `!== process.env.ADMIN_SECRET` → redirect to `/admin/login?redirect=<pathname>`.
    5. Else → `addShareHeaders` then `NextResponse.next()`.
  - `addShareHeaders(req, res)`: if pathname starts with `/s/`, set `Content-Security-Policy: frame-ancestors 'none'`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`.
  - Export config: `matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']`.

- [ ] **Tests:** None at middleware level (awkward to unit test; covered manually + Task 21).

- [ ] **Acceptance:** `pnpm tsc --noEmit` clean. Dev: `curl -I http://localhost:3000/shares` → 200; `curl -I http://localhost:3000/s/abcdefghijklmnop` → 200 with `X-Robots-Tag` header. Stage with `NODE_ENV=production`: `curl -I http://localhost:3000/shares` → 307 to `/admin/login`.

- [ ] **Commit:** `feat(middleware): gate prod paths except /s/[token] with ADMIN_SECRET cookie`

---

## Phase 5g — Deploy Mechanics (Tasks 19–20)

### Task 19 — Vercel project + env vars + first deploy

- [ ] **Goal:** Vercel project linked to GitHub repo, all env vars set, first prod deploy of `main` reaches `https://frame-bucket.vercel.app`.

- [ ] **Files:** None — Vercel dashboard / CLI work.

- [ ] **Implementation notes:**
  - `pnpm dlx vercel link` from repo root → create new project `frame-bucket`.
  - Set production env vars via `pnpm dlx vercel env add <NAME> production` (interactive) for: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `NOTION_API_KEY`, `NOTION_DATA_SOURCE_AESTHETICS/LAYOUTS/INTERACTIONS/SYSTEMS`, `ADMIN_SECRET`, `DAILY_COST_ALERT_USD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FB_ARCHIVE_BACKEND` (value `supabase`), `NEXT_PUBLIC_APP_URL` (value `https://frame-bucket.vercel.app`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Repeat for `preview` env (same values; `NEXT_PUBLIC_APP_URL` can be left to default or set to `https://${VERCEL_URL}` at runtime).
  - First deploy: push to `main` (Vercel auto-deploys) or `pnpm dlx vercel --prod` from local.
  - Verify: `curl -I https://frame-bucket.vercel.app/` → 307 to `/admin/login`. Log in, run wizard → confirm row appears in Supabase `artifacts` table.

- [ ] **Tests:** Manual.

- [ ] **Acceptance:** Prod URL reachable; unauthenticated requests redirect to `/admin/login`; after login, wizard generates against Supabase.

- [ ] **Commit:** `chore(deploy): provision Vercel project and prod env vars`

### Task 20 — GitHub Actions for Supabase migrations

- [ ] **Goal:** Workflow runs `supabase db push --linked` on every push to `main` touching `supabase/migrations/`. Preserves "schema changes are intentional."

- [ ] **Files:** `.github/workflows/db-migrate.yml` (NEW).

- [ ] **Implementation notes:**
  - Workflow trigger: `on.push.branches: [main]` with `paths: ['supabase/migrations/**']`.
  - Steps: checkout → `supabase/setup-cli@v1` → `supabase link --project-ref <ref> --password <pw>` → `supabase db push --linked`.
  - Required GitHub secrets (set via repo settings → Secrets → Actions): `SUPABASE_ACCESS_TOKEN` (from https://supabase.com/dashboard/account/tokens), `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
  - Vercel deploys can run in parallel with this workflow (separate triggers); for stricter ordering wire a Vercel deploy hook that fires only after this workflow succeeds. M5 keeps them parallel for simplicity — risk is brief schema/code drift during the first ~30s of a deploy, mitigated by the migrations being additive in M5.

- [ ] **Tests:** Manual.

- [ ] **Acceptance:** Adding a no-op SQL file under `supabase/migrations/` and pushing to `main` triggers the workflow and the migration shows up in the Supabase `supabase_migrations.schema_migrations` table.

- [ ] **Commit:** `ci(supabase): add GitHub Actions workflow to apply migrations on main push`

---

## Phase 5h — Validation Gate (Task 21)

### Task 21 — M5 end-to-end validation gate

- [ ] **Goal:** Run the full M5 procedure from spec § 10 against the production deploy. Document findings in a new validations doc mirroring the M4 gate's shape.

- [ ] **Files:** `docs/superpowers/validations/2026-05-XX-m5-shares.md` (NEW — replace `XX` with the day you run the gate).

- [ ] **Implementation notes:**
  - Use `docs/superpowers/validations/2026-05-12-m4-wizard.md` as the structural template (Setup table, Procedure checklist, Acceptance, Findings).
  - Pre-gate: confirm `https://frame-bucket.vercel.app` is current `main` deploy; confirm Supabase URL is prod; have two browsers (admin + private/incognito).
  - Walk every checklist item from spec § 10.1 in order. Failures get documented with severity (Low/Medium/High), root cause, fix. Fix high-severity inline (mid-gate fixes are normal — mirror the M4 gate pattern).
  - Rule cross-checks:
    - **Rule 1:** copy any `/api/iterate` POST body from DevTools Network → confirm no `previousHtml` field.
    - **Rule 2:** Network panel shows one request per Generate/Refine click.
    - **Rule 3:** `pnpm dlx vercel pull --environment=production .env.prod && pnpm build && grep -r "SUPABASE_SERVICE_ROLE" .next/static/ || echo CLEAN`. Expected: `CLEAN`. Also run the same grep against the prod build output once the next step's `scripts/check-no-key-leak.ts` is wired in.
    - **Rule 4:** `curl -i https://frame-bucket.vercel.app/s/foo` → 404. Check Supabase Dashboard → Logs → Postgres: confirm no query was issued for token `foo`.
    - **Rule 5:** open share page in private window with DevTools; observe TTFB on the page response; the share-page HTML returns before any view-tracking POST fires.

- [ ] **Tests:** Validation IS the test.

- [ ] **Acceptance:** All checklist items pass (with findings + fixes documented for any that didn't on first try). Validations doc committed. Update spec § 10 to link to the actual doc filename.

- [ ] **Commit:** `docs(validation): record M5 shares gate findings`

---

## Risks & Mitigations

| Risk                                                             | Likelihood | Severity | Mitigation                                                                               |
| ---------------------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------- |
| Service role key leaks via misimport                             | Medium     | Critical | Rule 3: `import 'server-only'` + naming + CI grep (Task 3 + future check-no-key-leak.ts) |
| Free-tier Supabase storage cap hit                               | Low        | Medium   | Cost monitor; flip to Pro at $25/mo                                                      |
| Preview deploy pollutes prod data                                | Medium     | Low      | Clearly-named test shares; switch to separate preview project later if it hurts          |
| Vercel/Supabase region mismatch latency                          | Low        | Low      | Match `iad1` / `us-east-1` at Task 1                                                     |
| Share URL indexed by Google despite unlisted                     | Low        | Medium   | `<meta robots>` (Task 13) + `X-Robots-Tag` (Task 18)                                     |
| Wizard generate breaks when Supabase down                        | Low        | High     | Tasks 5/6: throw on Supabase error; surfaces via existing /api/generate error envelope   |
| StrictMode flicker in CreateShareModal (M4 Finding 2 regression) | Medium     | Medium   | Task 14 reuses fixed checkpoint-name-modal pattern verbatim                              |
| Middleware locks out a critical path                             | Medium     | High     | Task 18 reviews `PUBLIC_PREFIXES`; Task 21 verifies expected paths in prod               |

---

## Out of Scope (Deferred to M5b / M6+)

- Custom domain (M6+); Supabase Auth + real RLS (M6+)
- Export-to-static download (M5b); embed code generator (M5b)
- Per-artifact filter, search, sort on `/shares` (M5b)
- Bulk operations (M5b); share-link TTL (M5b); per-share password (out)
- Open Graph unfurl meta tags (M5b); share preview thumbnails (M7)
- Automated migration of `tmp/generations/` → Supabase (manual only)
- Real-time view-count updates
- Notion sync webhook: middleware's `PUBLIC_PREFIXES` does NOT exempt `/api/admin/sync`. If you need it callable from a Notion webhook in prod, add it to `PUBLIC_PREFIXES` with an alternative shared-secret-header auth — defer until needed.

---

## Build Order Summary

| Tasks | Phase                   | Outcome                                                                                  |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------- |
| 1–6   | 5a — Backend infra      | Supabase provisioned; schema migrated; pluggable archive shipped. Dev still uses fs.     |
| 7–10  | 5b — Shares domain      | Token utils + ShareStore + two impls + view tracking. No UI yet.                         |
| 11–13 | 5c — API routes         | Create/list/rename/revoke endpoints + viewer-facing share page. Fully testable via curl. |
| 14–16 | 5d — Wizard integration | Create-share CTA + history sidebar indicator. End-to-end from wizard.                    |
| 17    | 5e — `/shares` page     | Author-facing management — rename + revoke + view counts.                                |
| 18    | 5f — Auth middleware    | `ADMIN_SECRET` cookie gate. Last, so dev iteration stays frictionless.                   |
| 19–20 | 5g — Deploy             | Vercel project + env vars + GHA for migrations. First prod deploy.                       |
| 21    | 5h — Validation gate    | End-to-end exercise against prod. Findings doc.                                          |

**Estimated implementation time** (subagent-driven, with two-stage review): ~15–20 hours of agent time.

**Estimated cost of validation runs:** ~$5–10 in Opus tokens.

When all 21 tasks land green and the validation gate passes, M5 is done. M5b (export, embed, search/sort on `/shares`) or M6 (auth + real RLS) follows.
