# Frame Bucket — M5 Design Spec (Shares + Deploy)

- **Status**: Draft — awaiting user review
- **Date**: 2026-05-16
- **Owner**: @mckechniep
- **Related**:
  - `docs/superpowers/specs/2026-04-14-frame-bucket-design.md` — original product spec
  - `docs/superpowers/plans/2026-05-10-frame-bucket-m4.md` — M4 plan (wizard) where M5 was deferred from
  - `docs/superpowers/validations/2026-05-12-m4-wizard.md` — M4 validation gate

---

## 1. Problem & Thesis

M4 made the wizard end-to-end usable on localhost. The pipeline works, the UI is intentional, persistence holds — but every generated artifact is trapped on the local filesystem at `tmp/generations/<id>/`. There is no way to send a link to anyone outside the developer's machine.

The driving M5 use case: **show a client or designer-in-network a polished link**. The recipient clicks a URL, sees the artifact full-bleed, never sees dev chrome. The author creates the link from inside the wizard, can rename or revoke it later, and can tell whether the recipient actually opened it.

This requires three things Frame Bucket doesn't have yet:

1. **A durable backing store** that survives server restarts and lives outside the developer's filesystem
2. **A public, unlisted share URL** with an unguessable token, plus the page that renders it
3. **An actual deploy** — there is no point shipping share infrastructure without a real Internet-reachable URL

M5 ships all three. It explicitly absorbs the M8 deploy step (which was originally separate). Export-to-static and embed codes — the other two M4 deferrals — are cut from M5 and pushed to M5b.

---

## 2. Foundational Decisions

These were locked in through clarifying questions during brainstorming on 2026-05-16.

| Decision                              | Choice                                                                                                    | Reasoning                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **M5 driver**                         | Show clients/partners polished work                                                                       | Determines durable storage, public URL, intentional share page                                                   |
| **Deploy in M5?**                     | Yes — absorbed from M8                                                                                    | Share links are useless without a real URL; can't validate the use case otherwise                                |
| **Hosting**                           | Vercel + Supabase                                                                                         | Both MCPs already authenticated; best fit for "ship today + grow into auth later"                                |
| **Share URL model**                   | Unlisted, link = password                                                                                 | Same model as Figma/Loom/Notion public pages; lowest friction for client previews                                |
| **Token shape**                       | 16 base62 chars (~95 bits entropy)                                                                        | Brute-force resistant by 7-12 orders of magnitude beyond any realistic attacker                                  |
| **Per-share or per-artifact tokens?** | Per-share                                                                                                 | Implied by user's choice of rename + revoke per share; one artifact can have N independent shares                |
| **Other M4 deferrals in scope?**      | No — share URLs only                                                                                      | Tight M5; export-to-static and embed codes move to M5b                                                           |
| **Recipient UX**                      | Full-bleed iframe + tiny footer                                                                           | Looks like a real microsite; minimal design surface                                                              |
| **Author UX**                         | On-demand share + `/shares` list with rename + revoke + last-viewed                                       | Bigger scope than auto-share but matches the "sharing real work to real people" use case                         |
| **HTML storage location**             | Postgres `text` column                                                                                    | Single source of truth; transactional; matches dev/prod symmetry; Postgres handles MB rows via TOAST compression |
| **Dev/prod runtime**                  | Pluggable — filesystem in dev, Supabase in prod                                                           | Preserves M4 offline dev flow; M4's `tmp/generations/` keeps working                                             |
| **Migration of dev artifacts**        | None — start prod fresh                                                                                   | Dev archive is churn per the M4 plan's notes; not worth a backfill script                                        |
| **RLS posture**                       | Disabled in M5 + build-time service-role-key leak guard                                                   | Browser never touches Supabase in M5; service-role bypasses RLS anyway; M6 enables real RLS with auth            |
| **Preview deploy data**               | Vercel previews talk to prod Supabase                                                                     | One-person team, non-sensitive data, revoke is cheap; re-evaluate at M6                                          |
| **Share-name capture**                | At creation, via modal                                                                                    | Defaults to brief's business name; rename available later from `/shares`                                         |
| **Admin auth in prod**                | Extend existing `ADMIN_SECRET` cookie gate to wizard, `/shares`, `/preview`, `/api/share/*` (Section 9.5) | M5's audience is operator + share-link recipients; `/shares` and wizard must not leak to strangers               |

---

## 3. Architecture Overview

```
 ┌────────────────────────────────────────────────────────────────────┐
 │                         Browser (client)                           │
 │                                                                    │
 │  Wizard (M4)                          Share page         /shares   │
 │       │                                  │                  │      │
 │       │ FinishActions:                   │ sandboxed       │      │
 │       │  [Create share link]             │ iframe          │      │
 │       ▼                                  │                  │      │
 │  CreateShareModal                     viewer-facing      author-  │
 │       │                                                    facing  │
 └───────┼────────────────────────────────────────────────────┼───────┘
         │                                                    │
         │  POST /api/share                              GET, PATCH, DELETE
         │                                                    │
 ┌───────▼────────────────────────────────────────────────────▼───────┐
 │                     Next.js server (App Router)                    │
 │                                                                    │
 │  /api/share          /api/share/[token]      /s/[token]            │
 │  (POST, GET)         (PATCH, DELETE)         (server-rendered)     │
 │       │                     │                       │              │
 │       └─────────┬───────────┘                       │              │
 │                 │                                   │              │
 │           ┌─────▼──────┐                  ┌─────────▼─────────┐    │
 │           │ ShareStore │                  │   ArchiveStore    │    │
 │           │ (interface)│                  │   (interface)     │    │
 │           └─────┬──────┘                  └─────────┬─────────┘    │
 │                 │                                   │              │
 │                 │                          ┌────────┴────────┐     │
 │                 │                          │                 │     │
 │           ┌─────▼──────┐         ┌─────────▼─────────┐   ┌───▼───┐ │
 │           │ Supabase   │         │ FilesystemArchive │   │Supabase│ │
 │           │ ShareStore │         │ Store (M4 code)   │   │Archive │ │
 │           │ (M5)       │         │                   │   │Store   │ │
 │           └────────────┘         └───────────────────┘   └────────┘ │
 │                 │                          │                 │     │
 │            ┌────▼──────────────────────────┴─────────────────▼─┐   │
 │            │     archive-factory.ts  (picks by env var)        │   │
 │            └───────────────────────────────────────────────────┘   │
 └────────────────────────────────────────────────────────────────────┘
                 │                                       │
         Supabase Postgres                       Local filesystem
         (prod: shares + artifacts)              (dev: tmp/generations/)
```

The wizard's existing `/api/generate` and `/api/iterate` routes remain unchanged at the wire level. They call `defaultArchiveStore()` exactly as they do today; only the factory's _return value_ changes based on env. No wizard code knows whether it's talking to Postgres or the filesystem.

---

## 4. File Structure Map

Only new and modified files. Everything else from M0–M4 is unchanged.

```
frame-bucket/
├── supabase/                                       — NEW
│   ├── config.toml                                 — local Supabase project config
│   └── migrations/
│       └── 20260516000000_m5_init.sql              — artifacts + shares tables
│
├── .github/workflows/
│   └── db-migrate.yml                              — NEW: Supabase CLI runs migrations on push to main
│
├── scripts/
│   └── check-no-key-leak.ts                        — NEW: CI grep against .next/static/
│
├── src/
│   ├── middleware.ts                               — NEW: admin-cookie gate for all paths except /s/[token] (Section 9.5)
│   ├── lib/
│   │   ├── generation/
│   │   │   ├── archive.ts                          — MODIFIED: extract interface; rename class to FilesystemArchiveStore
│   │   │   ├── archive-interface.ts                — NEW: ArchiveStore interface
│   │   │   ├── archive-supabase.ts                 — NEW: SupabaseArchiveStore implementation
│   │   │   └── archive-factory.ts                  — NEW: defaultArchiveStore() picks by FB_ARCHIVE_BACKEND env
│   │   ├── shares/                                 — NEW module
│   │   │   ├── share-store.ts                      — interface
│   │   │   ├── share-store-supabase.ts             — Supabase implementation
│   │   │   ├── share-store-memory.ts               — in-process impl for tests + dev fallback
│   │   │   ├── token.ts                            — generator + validator (Rule 4)
│   │   │   ├── view-tracking.ts                    — fire-and-forget, throttled, bot-filtered (Rule 5)
│   │   │   └── __tests__/
│   │   │       ├── token.test.ts
│   │   │       ├── share-store-memory.test.ts
│   │   │       └── view-tracking.test.ts
│   │   └── supabase/                               — NEW
│   │       ├── client-server.ts                    — service role; `import 'server-only'`
│   │       ├── client-browser.ts                   — anon key; safe for client components
│   │       ├── env.ts                              — startup env validation
│   │       └── database.types.ts                   — generated by `supabase gen types`
│   │
│   └── app/
│       ├── s/[token]/                              — NEW: viewer-facing share page
│       │   ├── page.tsx                            — server component
│       │   ├── revoked-view.tsx
│       │   ├── share-footer.tsx
│       │   └── not-found.tsx
│       ├── shares/                                 — NEW: author-side management page
│       │   ├── page.tsx
│       │   └── _components/
│       │       ├── shares-table.tsx
│       │       ├── share-row.tsx
│       │       ├── rename-modal.tsx                — reuses CreateShareModal in "edit" mode
│       │       └── revoke-confirm.tsx
│       ├── api/
│       │   └── share/                              — NEW
│       │       ├── route.ts                        — POST (create), GET (list)
│       │       └── [token]/
│       │           └── route.ts                    — PATCH (rename), DELETE (revoke)
│       └── wizard/
│           └── _components/
│               ├── finish-actions.tsx              — MODIFIED: promote Create share to primary CTA
│               ├── create-share-modal.tsx          — NEW
│               └── iteration-history.tsx           — MODIFIED: small "has shares" indicator per row
│
├── .env.example                                    — MODIFIED: document new env vars
└── package.json                                    — MODIFIED: add scripts (db:types, db:push, check:no-leak)
```

---

## 5. Data Model

### 5.1 Migration `supabase/migrations/20260516000000_m5_init.sql`

```sql
create extension if not exists "pgcrypto";

create table artifacts (
  id              text          primary key,                      -- text (not uuid) so dev/prod IDs coexist
  html            text          not null,
  html_source     text,
  meta            jsonb         not null,
  parent_id       text          references artifacts(id) on delete set null,
  iteration_round int           not null default 0,
  created_at      timestamptz   not null default now()
);

create index artifacts_parent_idx     on artifacts (parent_id);
create index artifacts_created_at_idx on artifacts (created_at desc);

create table shares (
  token            text          primary key,
  artifact_id      text          not null references artifacts(id) on delete cascade,
  name             text          not null check (char_length(name) between 1 and 120),
  revoked_at       timestamptz,
  last_viewed_at   timestamptz,
  view_count       int           not null default 0,
  created_at       timestamptz   not null default now()
);

create index shares_artifact_idx on shares (artifact_id);
create index shares_created_idx  on shares (created_at desc);
create index shares_live_idx     on shares (token) where revoked_at is null;

-- Throttle bucket for view tracking — see Rule 5
create table share_view_buckets (
  token              text          not null references shares(token) on delete cascade,
  bucket_started_at  timestamptz   not null,
  primary key (token, bucket_started_at)
);
```

### 5.2 RLS

RLS is **disabled** on all M5 tables. The browser never talks to Supabase directly; all reads/writes hop through Next.js routes using the service role key. Rule 3 (Section 7) prevents the service role key from leaking.

M6 enables RLS with real policies when auth lands.

### 5.3 ID column type

`artifacts.id` is `text`, not `uuid`, so the existing M3/M4 filesystem timestamp IDs (e.g. `20260504-023439-4a07`) can round-trip through Supabase if/when a manual migration happens. New artifact IDs in prod are generated with `gen_random_uuid()::text` to match the production-only shape.

### 5.4 Storage volume math

- ~100 artifacts × ~5MB each (after TOAST compression) = ~500MB
- Free Supabase tier: 500MB Postgres → comfortable through ~50 artifacts
- Pro tier ($25/mo) kicks in at ~50 artifact ceiling
- Egress: 1MB per share view × 100/day = 100MB/day ≈ free tier covered

Flag in your account budget; not an M5 blocker.

---

## 6. API Surface

### 6.1 Routes

| Method   | Path                 | Purpose                                     | External auth              | Server-side DB auth |
| -------- | -------------------- | ------------------------------------------- | -------------------------- | ------------------- |
| `POST`   | `/api/share`         | Create a share                              | Admin cookie (Section 9.5) | Service role        |
| `GET`    | `/api/share`         | List shares (newest first)                  | Admin cookie               | Service role        |
| `PATCH`  | `/api/share/[token]` | Rename                                      | Admin cookie               | Service role        |
| `DELETE` | `/api/share/[token]` | Revoke (soft delete)                        | Admin cookie               | Service role        |
| `GET`    | `/s/[token]`         | Viewer-facing share page (server component) | Public                     | Service role        |

In dev, all of these are reachable without the cookie (middleware no-ops when `NODE_ENV !== 'production'`).

All routes use the standard error envelope (matching existing `/api/generate`):

```ts
{ ok: false, error: { code: 'NOT_FOUND' | 'INVALID' | 'CONFLICT' | 'INTERNAL', message: string } }
```

### 6.2 `POST /api/share`

**Request:**

```ts
{
  artifactId: string,     // existing archive ID (dev: filesystem timestamp; prod: uuid)
  name: string,           // 1..120 chars, trimmed; validated with Zod
}
```

**Response:**

```ts
{
  token: string,          // 16-char base62
  url: string,            // absolute URL — built from NEXT_PUBLIC_APP_URL
  name: string,
  createdAt: string,      // ISO 8601
}
```

**Behavior:**

- Validate `artifactId` with `archive.exists(artifactId)` → 404 if missing
- Generate unguessable token (Rule 4)
- Insert row, return absolute URL

### 6.3 `GET /api/share`

Returns array of `{ token, name, artifactId, createdAt, lastViewedAt, viewCount, revokedAt }`, ordered `created_at desc`. No pagination in M5 (re-evaluate at ~few hundred shares).

### 6.4 `PATCH /api/share/[token]`

**Request:** `{ name: string }` — same validation as POST.

**Behavior:** Update name; return updated row. 404 if token absent. **Rename on a revoked share is a no-op** that returns 200 with the existing row — keeps the UI simple.

### 6.5 `DELETE /api/share/[token]`

Idempotent soft delete — `update shares set revoked_at = coalesce(revoked_at, now()) where token = $1`. Returns updated row. The actual row stays in the DB so view history is preserved.

### 6.6 `/s/[token]/page.tsx` — viewer-facing share page

Server component. Single Postgres read (joined: share + artifact). Sandboxed iframe with `srcDoc` inline — same model as existing `/preview/[artifactId]/page.tsx`. Three states:

- **Active:** full-bleed iframe + footer
- **Revoked:** "This preview was removed by the person who shared it" + footer
- **404:** standard Next.js `not-found.tsx`

Headers:

- `Content-Security-Policy: frame-ancestors 'none'` — prevents the share page from being embedded elsewhere
- `X-Robots-Tag: noindex, nofollow` — keeps unlisted URLs out of search indexes
- Iframe sandbox: `allow-scripts` only (matches `/preview/[artifactId]`)

### 6.7 Existing routes — what changes

**Nothing at the wire level.** `/api/generate`, `/api/iterate`, `/api/recommend` continue to call `defaultArchiveStore()`. The factory in `archive-factory.ts` is the only file that knows whether the returned store is `FilesystemArchiveStore` or `SupabaseArchiveStore`. Token-bomb invariants (Rules 1 and 2) from M3/M4 are preserved by construction.

---

## 7. Cross-Cutting Rules

M3 introduced Rule 1 (no `previousHtml` on the iterate wire). M4 added Rule 2 (one request per user action under StrictMode). M5 adds three more.

### 7.1 Rule 3 — Service role key never reaches the browser

**Invariant:** `SUPABASE_SERVICE_ROLE_KEY` is only readable from server-only code paths. Never appears in any browser bundle.

**Why it matters:** With RLS disabled in M5, this key is god-mode access to all shares and artifacts. Leak = full data exposure.

**Enforcement:**

1. `import 'server-only'` at top of `src/lib/supabase/client-server.ts` — Next.js 16 errors at build if a `'use client'` file imports it
2. Naming convention: `client-server.ts` vs `client-browser.ts` — visual hint at import site
3. CI step: `scripts/check-no-key-leak.ts` greps `.next/static/` for the key string and value; fails build if found

### 7.2 Rule 4 — Tokens validated server-side before any DB lookup

**Invariant:** Any incoming token string must match `/^[A-Za-z0-9]{16}$/` before any Postgres query. Malformed tokens 404 immediately.

**Why it matters:** Defense against enumeration cost (without validation, `/s/aaa`, `/s/bbb`, ... causes N Postgres queries per second). Validated tokens still have ~10^-21 hit probability per request.

**Enforcement:**

- Single validator function `isValidToken(s: string): boolean` in `src/lib/shares/token.ts`
- Every route handler calls it first; tested by unit tests
- Token generator is in the same file and tested to produce only validator-accepted strings

### 7.3 Rule 5 — View tracking never blocks share-page render

**Invariant:** Share page TTFB is bounded by the Postgres read for HTML — not by view-tracking writes, bot detection, or unfurl filtering.

**Why it matters:** Recipients judge by speed. Polished client previews must not stall on side-effect writes.

**Enforcement:**

- `void trackView(...)` — explicitly unawaited
- `try/catch` inside `trackView`; failures log but never propagate
- Bucket-table throttle (Section 5.1) bounds write throughput to 1 / 5min / token
- Bot UAs (Slackbot, Twitterbot, Discordbot, facebookexternalhit, etc.) and prefetch headers skip tracking entirely

### 7.4 Carry-forward rules

Rules 1 and 2 from M3/M4 still apply and are re-checked in the M5 validation gate.

---

## 8. UI Surface

### 8.1 Share page `/s/[token]`

Full-bleed sandboxed iframe + a 12px footer fixed bottom-right ("Made with Frame Bucket ↗", `Fraunces` italic). Footer text uses `oklch(80% 0 0)` with `mix-blend-mode: difference` so it stays legible over both light and dark artifacts.

Revoked state: same chrome, replaced body content with "This preview was removed by the person who shared it." Same footer.

### 8.2 CreateShareModal

Reuses the **M4 checkpoint-name-modal pattern** (the one with the Finding 2 fix that listens for `'cancel'` instead of `'close'` to avoid StrictMode flicker). Single text input pre-filled with `${brief.businessName} — round ${iterationRound}`. Save → POST `/api/share` → swap modal contents to a "Share link created" state with copy-to-clipboard URL.

### 8.3 FinishActions modifications

Promote "Create share link" to primary (accent-blue) CTA. Demote "Open standalone" and "Start a new project" to text links. Matches the CTA-color convention from commit `28236ee`.

### 8.4 History sidebar indicator

Small `Link2` Lucide icon next to a round if at least one non-revoked share exists for that artifact. Hover tooltip: "N active shares." Click navigates to `/shares` (no filter in M5; that's M5b).

### 8.5 `/shares` page

Standalone route — `src/app/shares/page.tsx`, no wizard chrome. Table:

| Column      | Notes                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Name        | The user-set name; click to rename inline (reuses CreateShareModal in edit mode) |
| URL         | Last 4 chars of token + copy-to-clipboard button                                 |
| Created     | Relative time                                                                    |
| Views       | Integer; updates only on page reload (no real-time)                              |
| Last viewed | Relative time, or `—` if never                                                   |
| Actions     | Rename, Revoke                                                                   |

Revoked rows shown at bottom, muted/struck-through. Empty state: "No shares yet. Create one from the Finish panel after generating an artifact."

### 8.6 Visual cohesion

Reuses existing CSS custom properties (`--color-accent`, `--color-ink`, `--color-ink-muted`, `--color-surface`, `--color-line`, `--text-lg`). No new design tokens. The footer in 8.1 is the entire branding budget for M5.

---

## 9. Deploy

### 9.1 Vercel

- New project linked to GitHub repo
- Production branch: `main` — push-to-main = deploy
- Preview branches: every PR gets `<branch>-frame-bucket-<hash>.vercel.app`
- Production domain: `frame-bucket.vercel.app` (custom domain deferred to M6+)
- Runtime: Node (not Edge — artifact HTML can be 10MB)
- Build: `pnpm build`; Install: `pnpm install --frozen-lockfile`

### 9.2 Supabase

- New project: `frame-bucket-prod`, region matching Vercel (`iad1` / `us-east-1`)
- Free tier; flip to Pro at ~50 artifact ceiling
- Migrations applied via Supabase CLI from `.github/workflows/db-migrate.yml`, triggered on push to `main` for changes under `supabase/migrations/`
- Migration runs **before** Vercel deploy starts (sequential via deployment hook). Vercel build never has DDL permission

### 9.3 Environment variables

| Variable                        | Scope                                                                            | Source                                     |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `ANTHROPIC_API_KEY`             | Vercel prod + preview                                                            | Existing dev value (or prod-only key)      |
| `OPENROUTER_API_KEY`            | Vercel prod + preview                                                            | Existing                                   |
| `NOTION_API_KEY`                | Vercel prod + preview                                                            | Existing                                   |
| `NOTION_DATA_SOURCE_*` (4 vars) | Vercel prod + preview                                                            | Existing                                   |
| `ADMIN_SECRET`                  | Vercel prod + preview                                                            | Rotate from dev                            |
| `DAILY_COST_ALERT_USD`          | Vercel prod + preview                                                            | Set to `5` for launch                      |
| `SUPABASE_URL`                  | Vercel prod + preview                                                            | Supabase project settings                  |
| `SUPABASE_ANON_KEY`             | Vercel prod + preview (public)                                                   | Supabase project settings                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Vercel prod + preview (server-only — Rule 3)                                     | Supabase project settings                  |
| `FB_ARCHIVE_BACKEND`            | Vercel: `supabase`. Local: unset → defaults to `fs`                              | New M5                                     |
| `NEXT_PUBLIC_APP_URL`           | Vercel prod: `https://frame-bucket.vercel.app`. Preview: `https://${VERCEL_URL}` | New M5 — used to build absolute share URLs |

### 9.4 Preview-deploy data strategy

**Vercel previews talk to prod Supabase.** Smallest setup; one-person team; non-sensitive data; revoke is one click. Re-evaluate at M6 if/when there are real users.

Alternative considered: separate `frame-bucket-preview` Supabase project (cleaner isolation, ~+1 day setup, doubled migration application). Switchable later without architectural change.

### 9.5 Auth posture for admin surfaces in prod

M5's published audience is "you" (the operator) plus "anyone with a share URL." The wizard, the shares list, and all the write endpoints are internal — strangers should not be able to reach them.

**Decision: extend the existing `ADMIN_SECRET` cookie gate** (already used by `/admin` at `src/app/admin/page.tsx`) to cover the entire app **except** the share-page surface.

Implementation:

- `src/middleware.ts` (new) runs on every request
- Allowlist of public paths: `/s/*`, `/admin/login`, `/api/admin/login`, Next.js static assets
- All other paths require the `ADMIN_SECRET` cookie or redirect to `/admin/login`
- The login endpoint extracts the secret from a form post, compares against `process.env.ADMIN_SECRET`, sets an `httpOnly` cookie with a 30-day expiry
- In dev (`NODE_ENV !== 'production'`), middleware is a no-op — preserves M4's zero-friction `pnpm dev` flow

This makes prod posture:

| Surface                                                                        | Auth                        |
| ------------------------------------------------------------------------------ | --------------------------- |
| `/s/[token]`                                                                   | Public (token = secret)     |
| `/admin/login`, `/api/admin/login`                                             | Public (the gate itself)    |
| `/`, `/wizard/*`, `/preview/*`, `/shares`, `/api/*` (excl. `/api/admin/login`) | Admin cookie                |
| Anything else                                                                  | Admin cookie (default-deny) |

`/preview/[artifactId]` stays admin-only in prod because it's dev chrome (artifact ID, recipe, cost, model, parent links visible). Recipients should never reach it — they see `/s/[token]`. The wizard's embedded iframe still works because the admin cookie is sent with same-origin requests.

If you'd rather leave the wizard publicly accessible in prod (anyone can generate, billing exposure included), say so during spec review — this section flips to a different shape.

---

## 10. Validation Gate

Findings doc lives at `docs/superpowers/validations/2026-05-XX-m5-shares.md`. Template mirrors the M4 gate at `docs/superpowers/validations/2026-05-12-m4-wizard.md`.

### 10.1 Procedure

- [ ] Prod deploy reachable at `https://frame-bucket.vercel.app`
- [ ] Unauthenticated request to `/wizard/brief`, `/shares`, `/preview/<any-id>` all redirect to `/admin/login`
- [ ] After admin cookie set, wizard and `/shares` reachable; full wizard works end-to-end in prod (brief → recommend → generate → iterate) — condensed M4 procedure
- [ ] `FB_ARCHIVE_BACKEND=supabase` is active (verify Supabase row exists after generate)
- [ ] No `tmp/generations/` written in prod (Vercel filesystem is ephemeral anyway)
- [ ] Create a share via FinishActions modal; copy URL; open in private window — artifact full-bleed with footer
- [ ] Footer link works
- [ ] **Rule 1**: iterate request body has no `previousHtml`
- [ ] **Rule 2**: one request per user action in prod
- [ ] **Rule 3**: `grep -r SUPABASE_SERVICE_ROLE .next/static/` returns nothing after `pnpm build`
- [ ] **Rule 4**: `/s/foo`, `/s/bar`, `/s/<sql-injection>` all return 404 with zero Postgres queries logged
- [ ] **Rule 5**: share page TTFB < 200ms (Vercel Analytics or DevTools)
- [ ] View tracking: open share, refresh `/shares`, view count = 1, `last_viewed_at` recent
- [ ] View tracking throttle: refresh share page 10× in 30sec, view count stays at 1 (or 2 if 5min boundary crossed)
- [ ] Bot UAs skipped: `curl -A "Slackbot 1.0" <share-url>` does not bump view count
- [ ] Rename via `/shares` reflects after page reload
- [ ] Revoke via `/shares` → private window shows "This preview was removed"
- [ ] Cross-session persistence: quit browser, reopen, `/shares` lists shares correctly
- [ ] Vercel preview deploy reachable; preview write lands in prod Supabase (clearly-named test share, delete after)

### 10.2 Acceptance

- All checklist items pass
- No console errors on share page (both author + recipient browsers)
- At least one finding-and-fix or explicit "no issues" written up in `2026-05-XX-m5-shares.md`

---

## 11. Out of Scope (Deferred to M5b / M6+)

- **Custom domain** (e.g., `share.frame-bucket.com`) — M6+
- **Supabase Auth** + real RLS policies — M6+
- **Export-to-static download button** on share page — M5b
- **Embed code generator** — M5b
- **Per-artifact filter on `/shares`** — M5b
- **Search / sort on `/shares`** — M5b
- **Bulk operations (multi-revoke)** — M5b
- **Share-link expiry / TTL** — M5b
- **Per-share password** — out (no compelling use case)
- **Share-link previews** (Open Graph meta tags for Slack/iMessage unfurls) — M5b unless trivial
- **Share preview thumbnail** in `/shares` table — M7 polish
- **Migration of `tmp/generations/` to Supabase** — manual one-time, not automated
- **Real-time view-count updates** — page reads once on load

---

## 12. Risks & Mitigations

| Risk                                                             | Likelihood     | Severity | Mitigation                                                                |
| ---------------------------------------------------------------- | -------------- | -------- | ------------------------------------------------------------------------- |
| Service role key leaks via misimport                             | Medium         | Critical | Rule 3: `import 'server-only'`, naming convention, CI grep                |
| Free-tier Supabase storage cap hit                               | Low (M5 scope) | Medium   | Cost monitor; flip to Pro at $25/mo                                       |
| Preview deploy pollutes prod data                                | Medium         | Low      | Clearly-named test shares; switchable to separate preview project later   |
| Vercel/Supabase region mismatch latency                          | Low            | Low      | Match `iad1` / `us-east-1` at setup                                       |
| Share URL indexed by Google despite unlisted                     | Low            | Medium   | `<meta name="robots" content="noindex,nofollow">` + `X-Robots-Tag` header |
| Wizard generate breaks because Supabase down                     | Low            | High     | Retry 3× then surface error to UI; generate stream itself unaffected      |
| StrictMode flicker in CreateShareModal (M4 Finding 2 regression) | Medium         | Medium   | Reuse the fixed checkpoint-name-modal pattern verbatim                    |

---

## 13. Cost Estimate

- ~15–20 hours subagent-driven implementation time
- ~$5–10 in Anthropic spend across implementation + validation gate runs
- One Supabase project (free tier OK to start)
- One Vercel project (Hobby tier OK to start)
- Expected M5 prod operating cost: **< $5/mo** at the current usage profile

---

## 14. Open Questions for Planning Phase

These are intentionally deferred from this spec — they're implementation details that the M5 plan (next doc) will pin down task-by-task:

1. **Token generation utility** — hand-roll the base62 generator, or use the `nanoid` package? Tradeoff: dependency footprint vs ~20 lines of well-tested code
2. **Wizard hydration when Supabase is the backend** — the existing `WizardHydrator` (M4 Task 13) drops persisted state for artifacts no longer in `tmp/generations/`. With Supabase, the equivalent check is an HTTP call to `/api/artifact/exists?id=...`. Does that need batching to avoid N round-trips on hydrate?
3. **Migration of existing `/preview/[artifactId]` page** — does the dev-mode preview page still need to work when `FB_ARCHIVE_BACKEND=fs`? Almost certainly yes; verify in the plan
4. **Test data fixtures for `share-store-supabase.test.ts`** — Vitest setup that talks to a local Supabase or to an in-memory mock? Probably mock; confirm in plan
5. **Wizard middleware exemptions** — Section 9.5 puts everything behind admin auth in prod except `/s/[token]`. Verify in plan that no critical path (Notion sync webhook, future Supabase webhook, etc.) gets accidentally locked out
6. **Login UX for the admin cookie** — `/admin/login` already exists; M5 might want a friendlier landing for the operator (or just keep the existing minimal page). Polish call for the plan
