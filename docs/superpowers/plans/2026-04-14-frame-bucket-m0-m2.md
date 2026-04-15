# Frame Bucket — M0–M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working end-to-end generation pipeline: Next.js app scaffolded → Notion sync producing a validated taxonomy cache → Opus-powered generation endpoint producing real HTML from a hardcoded test recipe. This is the risk-lifter for the Frame Bucket thesis.

**Architecture:** Next.js 15 App Router (Node runtime) with three layers: (1) routes/pages, (2) server API handlers, (3) core libs (`TaxonomyStore`, prompt assembly, Anthropic/Notion clients). Taxonomy data lives as a JSON cache synced from Notion; craft canon lives as markdown files versioned in git; prompts are assembled with positional `cache_control` markers so the canon and taxonomy form a reusable cache prefix.

**Tech Stack:** Next.js 15, TypeScript strict, Tailwind v4, shadcn/ui (Radix), Zod, Zustand, `@anthropic-ai/sdk`, `@notionhq/client`, Vitest + Testing Library, ESLint + Prettier, pnpm.

**Related spec:** `docs/superpowers/specs/2026-04-14-frame-bucket-design.md`

**Scope boundary:** This plan covers M0 (Bootstrap) through M2 (Generation MVP). M3 (Recommendation engine), M4 (Full wizard), M5 (Preview), M6 (Canon completion), M7 (Polish), and M8 (Ship) will be planned in a subsequent document once M2 validates the generation-quality thesis.

---

## File Structure Map

```
frame-bucket/
├── package.json                                  — deps, scripts
├── tsconfig.json                                 — strict TS, path aliases
├── next.config.ts
├── vitest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── .env.example                                  — env var template (placeholders only)
├── .env.local                                    — secrets (git-ignored)
├── README.md
│
├── data/
│   └── taxonomy.json                             — synced cache (gitignored)
│
├── src/
│   ├── env.ts                                    — Zod-validated env module
│   ├── lib/
│   │   ├── types/
│   │   │   ├── taxonomy.ts
│   │   │   ├── recipe.ts
│   │   │   └── index.ts
│   │   ├── schemas/
│   │   │   ├── taxonomy.ts
│   │   │   └── index.ts
│   │   ├── notion/
│   │   │   ├── client.ts
│   │   │   ├── mapper.ts
│   │   │   ├── fetcher.ts
│   │   │   └── __tests__/
│   │   ├── taxonomy/
│   │   │   ├── store.ts                          — TaxonomyStore interface
│   │   │   ├── file-store.ts
│   │   │   ├── diff.ts
│   │   │   ├── sync.ts
│   │   │   └── __tests__/
│   │   ├── prompts/
│   │   │   ├── craft-canon/
│   │   │   │   ├── base.md
│   │   │   │   ├── _override-template.md
│   │   │   │   └── aesthetics/
│   │   │   │       ├── editorial.md              — seed
│   │   │   │       ├── swiss.md                  — seed
│   │   │   │       ├── brutalist.md              — seed
│   │   │   │       └── corporate-clean.md        — seed
│   │   │   ├── output-contract.md
│   │   │   ├── assembler.ts
│   │   │   ├── loader.ts
│   │   │   └── __tests__/
│   │   ├── anthropic/
│   │   │   └── client.ts
│   │   ├── generation/
│   │   │   ├── archive.ts
│   │   │   └── __tests__/
│   │   ├── utils/
│   │   │   ├── slugify.ts
│   │   │   └── __tests__/
│   │   └── cost.ts
│   │
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                              — landing stub
│   │   ├── globals.css, _tokens.css              — design tokens
│   │   ├── wizard/[step]/page.tsx                — stub
│   │   ├── generate/page.tsx                     — stub
│   │   ├── preview/[artifactId]/page.tsx         — stub
│   │   ├── generate-test/                        — M2 harness
│   │   │   ├── page.tsx
│   │   │   ├── _form.tsx
│   │   │   └── _stream-view.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── login.tsx
│   │   │   └── sync-panel.tsx
│   │   └── api/
│   │       ├── admin/sync/route.ts
│   │       └── generate/route.ts
│   │
│   └── middleware.ts                             — admin gate
│
└── scripts/
    └── gen.ts                                    — prompt playground
```

**Non-code files authored as content tasks:**
- `src/lib/prompts/craft-canon/base.md` — drafted by assistant, user reviews line-by-line
- `src/lib/prompts/craft-canon/aesthetics/*.md` — 4 seed files, same review cadence
- `src/lib/prompts/output-contract.md` — drafted by assistant, reviewed by user

---

## Conventions

- **Package manager**: `pnpm`. Install once: `npm install -g pnpm@9`.
- **Node**: 20.11+.
- **Commit messages**: conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- **TypeScript**: strict, no `any`, path alias `@/` → `src/`.
- **Testing**: Vitest; tests live in `__tests__/` next to code.
- **Environment**: real credentials in `.env.local` (git-ignored). `.env.example` has only obvious angle-bracket placeholders.

---

## Phase 0 — M0: Bootstrap

### Task 1: Initialize Next.js project

**Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Scaffold Next.js 15 project**

From `/home/mckechniep/projects/frame-bucket`:

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --no-install
```

Choose "yes" when prompted about non-empty directory.

- [ ] **Step 2: Pin Node engine + pnpm in `package.json`**

```json
{
  "engines": { "node": ">=20.11" },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 3: Install baseline deps**

```bash
pnpm install
```

- [ ] **Step 4: Verify dev server boots**

```bash
pnpm dev
```

Open `http://localhost:3000`; confirm welcome page. Kill with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app with TS, Tailwind, App Router"
```

---

### Task 2: Strict TypeScript config

**Files:** `tsconfig.json`

- [ ] **Step 1: Replace `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Verify**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: enable strict TypeScript with extra safety flags"
```

---

### Task 3: Install core dependencies

- [ ] **Step 1: Runtime deps**

```bash
pnpm add zod zustand @anthropic-ai/sdk @notionhq/client lucide-react clsx tailwind-merge
```

- [ ] **Step 2: Dev deps**

```bash
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/dom jsdom @types/node tsx prettier eslint-config-prettier dotenv tsconfig-paths
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install core runtime and dev dependencies"
```

---

### Task 4: Configure Vitest + scripts

**Files:** `vitest.config.ts`, `package.json`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/__tests__/**'],
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

- [ ] **Step 2: Update `package.json` scripts**

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "gen": "tsx -r tsconfig-paths/register scripts/gen.ts"
}
```

- [ ] **Step 3: Verify**

```bash
pnpm test
```

Expected: "No test files found" (zero tests yet, non-failure).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: configure Vitest with path alias and coverage"
```

---

### Task 5: Env validation module

**Files:** `src/env.ts`, `src/__tests__/env.test.ts`, `.env.example`

- [ ] **Step 1: Create `src/__tests__/env.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('env', () => {
  const OLD = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD };
  });

  it('throws when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.NOTION_API_KEY = 'test-notion';
    process.env.NOTION_DB_AESTHETICS = 'a'.repeat(32);
    process.env.NOTION_DB_LAYOUTS = 'b'.repeat(32);
    process.env.NOTION_DB_INTERACTIONS = 'c'.repeat(32);
    process.env.NOTION_DB_SYSTEMS = 'd'.repeat(32);
    process.env.ADMIN_SECRET = 'x'.repeat(20);
    await expect(import('../env')).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('parses and exposes valid env', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    process.env.NOTION_API_KEY = 'test-notion';
    process.env.NOTION_DB_AESTHETICS = 'a'.repeat(32);
    process.env.NOTION_DB_LAYOUTS = 'b'.repeat(32);
    process.env.NOTION_DB_INTERACTIONS = 'c'.repeat(32);
    process.env.NOTION_DB_SYSTEMS = 'd'.repeat(32);
    process.env.ADMIN_SECRET = 'x'.repeat(20);

    const { env } = await import('../env');
    expect(env.ANTHROPIC_API_KEY).toBe('test-anthropic');
    expect(env.NOTION_DB_AESTHETICS.length).toBe(32);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
pnpm test src/__tests__/env.test.ts
```

- [ ] **Step 3: Implement `src/env.ts`**

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  NOTION_API_KEY: z.string().min(1, 'NOTION_API_KEY is required'),
  NOTION_DB_AESTHETICS: z.string().length(32),
  NOTION_DB_LAYOUTS: z.string().length(32),
  NOTION_DB_INTERACTIONS: z.string().length(32),
  NOTION_DB_SYSTEMS: z.string().length(32),
  ADMIN_SECRET: z.string().min(16),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  DAILY_COST_ALERT_USD: z.coerce.number().default(50),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
```

- [ ] **Step 4: Run test — expect pass**

```bash
pnpm test src/__tests__/env.test.ts
```

- [ ] **Step 5: Create `.env.example`**

Use angle-bracket placeholders so scanners don't misfire:

```
# Copy to .env.local and fill real values. Never commit .env.local.
ANTHROPIC_API_KEY=<your-anthropic-key>
NOTION_API_KEY=<your-notion-token>
NOTION_DB_AESTHETICS=<aesthetics-db-id-32-chars>
NOTION_DB_LAYOUTS=<layouts-db-id-32-chars>
NOTION_DB_INTERACTIONS=<interactions-db-id-32-chars>
NOTION_DB_SYSTEMS=<systems-db-id-32-chars>
ADMIN_SECRET=<random-admin-string-16-plus-chars>
DAILY_COST_ALERT_USD=50
```

- [ ] **Step 6: Commit**

```bash
git add src/env.ts src/__tests__/env.test.ts .env.example
git commit -m "feat(env): add Zod-validated env module with tests"
```

---

### Task 6: ESLint + Prettier

**Files:** `.eslintrc.cjs`, `.prettierrc`

- [ ] **Step 1: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

- [ ] **Step 2: Create `.eslintrc.cjs`**

```js
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript', 'prettier'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
  },
};
```

- [ ] **Step 3: Format + lint**

```bash
pnpm exec prettier --write .
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.cjs .prettierrc
git commit -m "chore: configure ESLint + Prettier with strict rules"
```

---

### Task 7: Design tokens + globals

**Files:** `src/app/globals.css`, `src/app/_tokens.css`

- [ ] **Step 1: Replace `globals.css`**

```css
@import 'tailwindcss';
@import './_tokens.css';

html, body {
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-feature-settings: 'ss01', 'cv11';
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
  }
}
```

- [ ] **Step 2: Create `src/app/_tokens.css`**

```css
:root {
  --color-surface: oklch(98% 0.005 80);
  --color-surface-alt: oklch(95% 0.006 80);
  --color-ink: oklch(18% 0.01 260);
  --color-ink-muted: oklch(45% 0.01 260);
  --color-accent: oklch(55% 0.15 250);
  --color-border: oklch(88% 0.005 80);

  --font-display: 'Fraunces', ui-serif, Georgia, serif;
  --font-body: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  --text-base: clamp(1rem, 0.95rem + 0.25vw, 1.0625rem);
  --text-lg: clamp(1.125rem, 1.06rem + 0.3vw, 1.25rem);
  --text-xl: clamp(1.375rem, 1.25rem + 0.6vw, 1.625rem);
  --text-2xl: clamp(1.75rem, 1.5rem + 1vw, 2.25rem);
  --text-3xl: clamp(2.25rem, 1.8rem + 2vw, 3.25rem);
  --text-hero: clamp(2.75rem, 1.75rem + 4vw, 5rem);

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-section: clamp(3rem, 2rem + 4vw, 6rem);

  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 450ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
}
```

- [ ] **Step 3: Verify dev server renders**

```bash
pnpm dev
```

Check bg color at `http://localhost:3000` matches `--color-surface`. Kill.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/_tokens.css
git commit -m "feat(styles): add design token layer with Tailwind v4"
```

---

### Task 8: Route skeleton

**Files:** `src/app/page.tsx`, `src/app/wizard/[step]/page.tsx`, `src/app/generate/page.tsx`, `src/app/preview/[artifactId]/page.tsx`, `src/app/generate-test/page.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/middleware.ts`

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-semibold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
        frame bucket
      </h1>
      <p className="text-base opacity-70 mb-8">Build a site from a design recipe.</p>
      <Link
        href="/wizard/brief"
        className="px-6 py-3 rounded-md border border-current hover:bg-black hover:text-white transition"
      >
        Start a new design →
      </Link>
      <Link href="/admin" className="mt-8 text-sm underline opacity-60">
        Admin
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Create `src/app/wizard/[step]/page.tsx`**

```tsx
export default async function WizardStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  return (
    <main className="p-8">
      <h1 className="text-2xl">Wizard — step: {step}</h1>
      <p className="mt-4 opacity-70">Stub (M4).</p>
    </main>
  );
}
```

- [ ] **Step 3: Create `src/app/generate/page.tsx`**

```tsx
export default function GeneratePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl">Generate</h1>
      <p className="mt-4 opacity-70">Stub (M5).</p>
    </main>
  );
}
```

- [ ] **Step 4: Create `src/app/preview/[artifactId]/page.tsx`**

```tsx
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  return (
    <main className="p-8">
      <h1 className="text-2xl">Preview</h1>
      <p className="mt-4 opacity-70">Artifact: {artifactId} (stub, M5).</p>
    </main>
  );
}
```

- [ ] **Step 5: Create `src/app/generate-test/page.tsx`** (replaced in Task 35)

```tsx
export default function GenerateTestPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl">Generate Test Harness</h1>
      <p className="mt-4 opacity-70">Filled in during Task 35.</p>
    </main>
  );
}
```

- [ ] **Step 6: Create `src/app/admin/layout.tsx`**

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen p-8 bg-[var(--color-surface-alt)]">
      <header className="mb-8">
        <h1 className="text-2xl" style={{ fontFamily: 'var(--font-display)' }}>
          Admin
        </h1>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 7: Create `src/app/admin/page.tsx`** (replaced in Task 20)

```tsx
export default function AdminPage() {
  return (
    <section>
      <p className="opacity-70">Taxonomy sync (stub, M1).</p>
    </section>
  );
}
```

- [ ] **Step 8: Create `src/middleware.ts`** (expanded in Task 18)

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    // Guard is added in Task 18.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
```

- [ ] **Step 9: Verify all routes resolve**

```bash
pnpm dev
```

Visit `/`, `/wizard/brief`, `/generate`, `/preview/abc`, `/generate-test`, `/admin`. All should render stub content. Kill.

- [ ] **Step 10: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 11: Commit**

```bash
git add src/app src/middleware.ts
git commit -m "feat(routes): add route skeleton for all M0-M5 pages"
```

---

### Task 9: `slugify` utility

**Files:** `src/lib/utils/slugify.ts`, `src/lib/utils/__tests__/slugify.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Editorial')).toBe('editorial');
  });
  it('handles slashes and multi-word names', () => {
    expect(slugify('Brutalist / Neo-Brutalist')).toBe('brutalist-neo-brutalist');
  });
  it('strips special chars and collapses dashes', () => {
    expect(slugify('Y2K / Retro-Futurist!')).toBe('y2k-retro-futurist');
  });
  it('trims leading and trailing dashes', () => {
    expect(slugify('  --Cyberpunk--  ')).toBe('cyberpunk');
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm test slugify
```

- [ ] **Step 3: Implement `src/lib/utils/slugify.ts`**

```ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s/_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Run — expect 4 passed**

```bash
pnpm test slugify
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils
git commit -m "feat(utils): add slugify with tests"
```

---

### Task 10: README + `.gitignore` polish

- [ ] **Step 1: Append to `.gitignore`**

```
# local data
/data/taxonomy.json
/data/sync-log.jsonl
/tmp/generations/

# vitest
coverage/
.vitest-cache/
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Frame Bucket

AI-powered web design tool built around a 4-bucket taxonomy.

## Setup

1. `pnpm install`
2. `cp .env.example .env.local` and fill in real values
3. `pnpm dev`

## Scripts

- `pnpm dev` — Next.js dev server
- `pnpm test` — Vitest
- `pnpm typecheck` — strict tsc
- `pnpm lint` — ESLint
- `pnpm gen <aesthetic-id> <layout-id>` — prompt playground

## Docs

- Design spec: `docs/superpowers/specs/2026-04-14-frame-bucket-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-14-frame-bucket-m0-m2.md`
```

- [ ] **Step 3: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: README and gitignore polish"
```

---

**M0 complete.** Scaffolded app with strict types, lint/format/test infra, env validation, route skeleton, design tokens, one tested utility.

---

## Phase 1 — M1: Taxonomy + Notion Sync

### Task 11: Taxonomy types

**Files:** `src/lib/types/taxonomy.ts`, `src/lib/types/index.ts`

- [ ] **Step 1: Create `src/lib/types/taxonomy.ts`**

```ts
export type Bucket = 'aesthetic' | 'layout' | 'interaction' | 'system';

export interface TaxonomyEntry {
  id: string;
  bucket: Bucket;
  name: string;
  shortDefinition: string;
  coreMood: string;
  bestUseCase: string;
  distinctiveSignals: string[];
  notes: string;
  notionId: string;
  hasOverride: boolean;
}

export interface Taxonomy {
  syncedAt: string;
  syncedBy: string;
  schemaVersion: number;
  aesthetics: TaxonomyEntry[];
  layouts: TaxonomyEntry[];
  interactions: TaxonomyEntry[];
  systems: TaxonomyEntry[];
}

export const TAXONOMY_SCHEMA_VERSION = 1;
```

- [ ] **Step 2: Create `src/lib/types/index.ts`**

```ts
export * from './taxonomy';
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add src/lib/types
git commit -m "feat(types): add taxonomy types and schema version constant"
```

---

### Task 12: Taxonomy Zod schemas

**Files:** `src/lib/schemas/taxonomy.ts`, `src/lib/schemas/index.ts`, `src/lib/schemas/__tests__/taxonomy.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { TaxonomyEntrySchema, NotionPropertiesSchema } from '../taxonomy';

describe('TaxonomyEntrySchema', () => {
  it('accepts a valid entry', () => {
    const valid = {
      id: 'editorial',
      bucket: 'aesthetic',
      name: 'Editorial',
      shortDefinition: 'Content-first direction.',
      coreMood: 'Considered, editorial.',
      bestUseCase: 'Brand stories.',
      distinctiveSignals: ['type-led hierarchy', 'generous whitespace'],
      notes: '',
      notionId: 'page-id-1',
      hasOverride: true,
    };
    expect(TaxonomyEntrySchema.parse(valid)).toEqual(valid);
  });

  it('rejects entry with empty distinctiveSignals', () => {
    expect(() =>
      TaxonomyEntrySchema.parse({
        id: 'x',
        bucket: 'aesthetic',
        name: 'X',
        shortDefinition: 'x',
        coreMood: 'x',
        bestUseCase: 'x',
        distinctiveSignals: [],
        notes: '',
        notionId: 'p',
        hasOverride: false,
      }),
    ).toThrow();
  });

  it('rejects entry missing shortDefinition', () => {
    expect(() =>
      TaxonomyEntrySchema.parse({
        id: 'x',
        bucket: 'layout',
        name: 'X',
        coreMood: 'x',
        bestUseCase: 'x',
        distinctiveSignals: ['y'],
        notes: '',
        notionId: 'p',
        hasOverride: false,
      }),
    ).toThrow();
  });
});

describe('NotionPropertiesSchema', () => {
  it('parses expected Notion shape', () => {
    const input = {
      name: 'Editorial',
      shortDefinition: 'x',
      coreMood: 'x',
      bestUseCase: 'x',
      distinctiveSignals: ['a', 'b'],
      notes: '',
    };
    expect(NotionPropertiesSchema.parse(input)).toEqual(input);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm test schemas/__tests__/taxonomy
```

- [ ] **Step 3: Implement `src/lib/schemas/taxonomy.ts`**

```ts
import { z } from 'zod';

export const BucketSchema = z.enum(['aesthetic', 'layout', 'interaction', 'system']);

export const TaxonomyEntrySchema = z.object({
  id: z.string().min(1),
  bucket: BucketSchema,
  name: z.string().min(1),
  shortDefinition: z.string().min(1),
  coreMood: z.string().min(1),
  bestUseCase: z.string().min(1),
  distinctiveSignals: z.array(z.string().min(1)).min(1),
  notes: z.string(),
  notionId: z.string().min(1),
  hasOverride: z.boolean(),
});

export const TaxonomySchema = z.object({
  syncedAt: z.string().datetime(),
  syncedBy: z.string().min(1),
  schemaVersion: z.number().int().min(1),
  aesthetics: z.array(TaxonomyEntrySchema),
  layouts: z.array(TaxonomyEntrySchema),
  interactions: z.array(TaxonomyEntrySchema),
  systems: z.array(TaxonomyEntrySchema),
});

export const NotionPropertiesSchema = z.object({
  name: z.string().min(1),
  shortDefinition: z.string().min(1),
  coreMood: z.string().min(1),
  bestUseCase: z.string().min(1),
  distinctiveSignals: z.array(z.string().min(1)).min(1),
  notes: z.string(),
});

export type NotionProperties = z.infer<typeof NotionPropertiesSchema>;
```

- [ ] **Step 4: Create barrel `src/lib/schemas/index.ts`**

```ts
export * from './taxonomy';
```

- [ ] **Step 5: Run — expect 4 passed**

```bash
pnpm test schemas/__tests__/taxonomy
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas
git commit -m "feat(schemas): add Zod schemas for taxonomy and Notion properties"
```

---

### Task 13: Notion page → TaxonomyEntry mapper

**Files:** `src/lib/notion/mapper.ts`, `src/lib/notion/__tests__/mapper.test.ts`, `src/lib/notion/fixtures/sample-page.json`

- [ ] **Step 1: Create fixture `src/lib/notion/fixtures/sample-page.json`**

```json
{
  "object": "page",
  "id": "00000000-0000-0000-0000-0000000000aa",
  "properties": {
    "Name": {
      "id": "title",
      "type": "title",
      "title": [{ "plain_text": "Editorial" }]
    },
    "Short Definition": {
      "id": "short",
      "type": "rich_text",
      "rich_text": [{ "plain_text": "A type-led, content-first direction rooted in magazine design." }]
    },
    "Core Mood": {
      "id": "mood",
      "type": "rich_text",
      "rich_text": [{ "plain_text": "Considered, editorial, unhurried." }]
    },
    "Best Use Case": {
      "id": "usecase",
      "type": "rich_text",
      "rich_text": [{ "plain_text": "Brand stories, long-form content." }]
    },
    "Distinctive Signals": {
      "id": "signals",
      "type": "multi_select",
      "multi_select": [
        { "name": "type-led hierarchy" },
        { "name": "generous whitespace" },
        { "name": "asymmetric grids" }
      ]
    },
    "Notes": {
      "id": "notes",
      "type": "rich_text",
      "rich_text": [{ "plain_text": "Editorial shines when content is actually good." }]
    }
  }
}
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mapNotionPageToEntry } from '../mapper';
import samplePage from '../fixtures/sample-page.json';

describe('mapNotionPageToEntry', () => {
  it('maps a well-formed aesthetic page', () => {
    const entry = mapNotionPageToEntry(samplePage as any, 'aesthetic', true);
    expect(entry).toEqual({
      id: 'editorial',
      bucket: 'aesthetic',
      name: 'Editorial',
      shortDefinition: 'A type-led, content-first direction rooted in magazine design.',
      coreMood: 'Considered, editorial, unhurried.',
      bestUseCase: 'Brand stories, long-form content.',
      distinctiveSignals: ['type-led hierarchy', 'generous whitespace', 'asymmetric grids'],
      notes: 'Editorial shines when content is actually good.',
      notionId: '00000000-0000-0000-0000-0000000000aa',
      hasOverride: true,
    });
  });

  it('falls back to comma-split rich_text when Distinctive Signals is rich_text', () => {
    const richTextVariant = {
      ...(samplePage as any),
      properties: {
        ...(samplePage as any).properties,
        'Distinctive Signals': {
          id: 'signals',
          type: 'rich_text',
          rich_text: [{ plain_text: 'raw textures, oversized type, asymmetric crashes' }],
        },
      },
    };
    const entry = mapNotionPageToEntry(richTextVariant, 'aesthetic', false);
    expect(entry.distinctiveSignals).toEqual([
      'raw textures',
      'oversized type',
      'asymmetric crashes',
    ]);
    expect(entry.hasOverride).toBe(false);
  });

  it('throws when Short Definition is missing', () => {
    const broken = {
      ...(samplePage as any),
      properties: {
        ...(samplePage as any).properties,
        'Short Definition': { type: 'rich_text', rich_text: [] },
      },
    };
    expect(() => mapNotionPageToEntry(broken, 'aesthetic', true)).toThrow(
      /Short Definition.*Editorial/,
    );
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test notion/__tests__/mapper
```

- [ ] **Step 4: Implement `src/lib/notion/mapper.ts`**

```ts
import { slugify } from '@/lib/utils/slugify';
import type { Bucket, TaxonomyEntry } from '@/lib/types';

type NotionPage = {
  id: string;
  properties: Record<string, unknown>;
};

function getPlainText(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return '';
  const p = prop as {
    type?: string;
    title?: Array<{ plain_text: string }>;
    rich_text?: Array<{ plain_text: string }>;
  };
  if (p.type === 'title' && Array.isArray(p.title)) {
    return p.title.map((x) => x.plain_text).join('').trim();
  }
  if (p.type === 'rich_text' && Array.isArray(p.rich_text)) {
    return p.rich_text.map((x) => x.plain_text).join('').trim();
  }
  return '';
}

function getMultiSelectOrCommaSplit(prop: unknown): string[] {
  if (!prop || typeof prop !== 'object') return [];
  const p = prop as {
    type?: string;
    multi_select?: Array<{ name: string }>;
    rich_text?: Array<{ plain_text: string }>;
  };
  if (p.type === 'multi_select' && Array.isArray(p.multi_select)) {
    return p.multi_select.map((x) => x.name.trim()).filter(Boolean);
  }
  const text = getPlainText(prop);
  if (!text) return [];
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export class MappingError extends Error {
  constructor(
    message: string,
    public readonly pageId: string,
    public readonly pageName: string,
  ) {
    super(message);
    this.name = 'MappingError';
  }
}

export function mapNotionPageToEntry(
  page: NotionPage,
  bucket: Bucket,
  hasOverride: boolean,
): TaxonomyEntry {
  const name = getPlainText(page.properties['Name']);
  if (!name) {
    throw new MappingError(`Missing "Name" for page ${page.id}`, page.id, '(unknown)');
  }
  const shortDefinition = getPlainText(page.properties['Short Definition']);
  if (!shortDefinition) {
    throw new MappingError(
      `Missing "Short Definition" for page ${name} (${page.id})`,
      page.id,
      name,
    );
  }
  const coreMood = getPlainText(page.properties['Core Mood']);
  if (!coreMood) {
    throw new MappingError(`Missing "Core Mood" for page ${name} (${page.id})`, page.id, name);
  }
  const bestUseCase = getPlainText(page.properties['Best Use Case']);
  if (!bestUseCase) {
    throw new MappingError(
      `Missing "Best Use Case" for page ${name} (${page.id})`,
      page.id,
      name,
    );
  }
  const distinctiveSignals = getMultiSelectOrCommaSplit(page.properties['Distinctive Signals']);
  if (distinctiveSignals.length === 0) {
    throw new MappingError(
      `Missing "Distinctive Signals" for page ${name} (${page.id})`,
      page.id,
      name,
    );
  }
  const notes = getPlainText(page.properties['Notes']);
  return {
    id: slugify(name),
    bucket,
    name,
    shortDefinition,
    coreMood,
    bestUseCase,
    distinctiveSignals,
    notes,
    notionId: page.id,
    hasOverride,
  };
}
```

- [ ] **Step 5: Run — expect 3 passed**

```bash
pnpm test notion/__tests__/mapper
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/notion
git commit -m "feat(notion): add Notion page → TaxonomyEntry mapper with tests"
```

---

### Task 14: Notion client + paginating fetcher

**Files:** `src/lib/notion/client.ts`, `src/lib/notion/fetcher.ts`, `src/lib/notion/__tests__/fetcher.test.ts`

- [ ] **Step 1: Create `src/lib/notion/client.ts`**

```ts
import { Client } from '@notionhq/client';
import { env } from '@/env';

let _client: Client | null = null;

export function getNotionClient(): Client {
  if (!_client) {
    _client = new Client({ auth: env.NOTION_API_KEY });
  }
  return _client;
}
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchBucket } from '../fetcher';

describe('fetchBucket', () => {
  it('paginates and collects results', async () => {
    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ id: 'p1' }, { id: 'p2' }],
        has_more: true,
        next_cursor: 'cur-1',
      })
      .mockResolvedValueOnce({
        results: [{ id: 'p3' }],
        has_more: false,
        next_cursor: null,
      });
    const mockClient = { databases: { query: mockQuery } } as any;
    const pages = await fetchBucket(mockClient, 'db-id-123');
    expect(pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      database_id: 'db-id-123',
      start_cursor: 'cur-1',
      page_size: 100,
    });
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test notion/__tests__/fetcher
```

- [ ] **Step 4: Implement `src/lib/notion/fetcher.ts`**

```ts
import type { Client } from '@notionhq/client';

export interface NotionPageLike {
  id: string;
  properties: Record<string, unknown>;
}

export async function fetchBucket(client: Client, databaseId: string): Promise<NotionPageLike[]> {
  const pages: NotionPageLike[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;
  while (hasMore) {
    const response: any = await client.databases.query({
      database_id: databaseId,
      ...(cursor ? { start_cursor: cursor } : {}),
      page_size: 100,
    });
    pages.push(...(response.results as NotionPageLike[]));
    hasMore = response.has_more;
    cursor = response.next_cursor ?? undefined;
  }
  return pages;
}
```

- [ ] **Step 5: Run — expect pass; commit**

```bash
pnpm test notion/__tests__/fetcher
git add src/lib/notion
git commit -m "feat(notion): add singleton client and paginating fetcher with tests"
```

---

### Task 15: TaxonomyStore + FileStore

**Files:** `src/lib/taxonomy/store.ts`, `src/lib/taxonomy/file-store.ts`, `src/lib/taxonomy/__tests__/file-store.test.ts`

- [ ] **Step 1: Create `src/lib/taxonomy/store.ts`**

```ts
import type { Taxonomy } from '@/lib/types';

export interface SyncLogEntry {
  at: string;
  by: string;
  summary: string;
  added: number;
  modified: number;
  removed: number;
  renamed: number;
}

export interface TaxonomyStore {
  get(): Promise<Taxonomy | null>;
  set(taxonomy: Taxonomy): Promise<void>;
  history(limit?: number): Promise<SyncLogEntry[]>;
  appendHistory(entry: SyncLogEntry): Promise<void>;
}
```

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStore } from '../file-store';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TAXONOMY_SCHEMA_VERSION, type Taxonomy } from '@/lib/types';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-filestore-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const example: Taxonomy = {
  syncedAt: '2026-04-14T10:00:00.000Z',
  syncedBy: 'tester',
  schemaVersion: TAXONOMY_SCHEMA_VERSION,
  aesthetics: [],
  layouts: [],
  interactions: [],
  systems: [],
};

describe('FileStore', () => {
  it('returns null when cache does not exist', async () => {
    const s = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));
    expect(await s.get()).toBeNull();
  });

  it('round-trips through set/get', async () => {
    const s = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));
    await s.set(example);
    expect(await s.get()).toEqual(example);
  });

  it('appends history, returns reverse-chronological', async () => {
    const s = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));
    await s.appendHistory({
      at: '2026-04-14T10:00:00.000Z',
      by: 'tester',
      summary: 'first',
      added: 0,
      modified: 0,
      removed: 0,
      renamed: 0,
    });
    await s.appendHistory({
      at: '2026-04-14T11:00:00.000Z',
      by: 'tester',
      summary: 'second',
      added: 1,
      modified: 0,
      removed: 0,
      renamed: 0,
    });
    const entries = await s.history();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.summary).toBe('second');
  });

  it('rejects invalid cache on get (schema mismatch)', async () => {
    const file = path.join(tmpDir, 'tax.json');
    await fs.writeFile(file, JSON.stringify({ bogus: true }));
    const s = new FileStore(file, path.join(tmpDir, 'log.jsonl'));
    await expect(s.get()).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test taxonomy/__tests__/file-store
```

- [ ] **Step 4: Implement `src/lib/taxonomy/file-store.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { TaxonomySchema } from '@/lib/schemas';
import type { Taxonomy } from '@/lib/types';
import type { TaxonomyStore, SyncLogEntry } from './store';

export class FileStore implements TaxonomyStore {
  constructor(
    private readonly dataPath: string,
    private readonly logPath: string,
  ) {}

  async get(): Promise<Taxonomy | null> {
    try {
      const raw = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return TaxonomySchema.parse(parsed);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async set(taxonomy: Taxonomy): Promise<void> {
    const validated = TaxonomySchema.parse(taxonomy);
    await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
    await fs.writeFile(this.dataPath, JSON.stringify(validated, null, 2) + '\n', 'utf-8');
  }

  async history(limit = 50): Promise<SyncLogEntry[]> {
    try {
      const raw = await fs.readFile(this.logPath, 'utf-8');
      const entries = raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SyncLogEntry);
      return entries.reverse().slice(0, limit);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async appendHistory(entry: SyncLogEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');
  }
}

export function defaultFileStore(): FileStore {
  const root = process.cwd();
  return new FileStore(
    path.join(root, 'data', 'taxonomy.json'),
    path.join(root, 'data', 'sync-log.jsonl'),
  );
}
```

- [ ] **Step 5: Run — expect 4 passed; commit**

```bash
pnpm test taxonomy/__tests__/file-store
git add src/lib/taxonomy
git commit -m "feat(taxonomy): add TaxonomyStore interface and FileStore implementation"
```

---

### Task 16: Diff computation

**Files:** `src/lib/taxonomy/diff.ts`, `src/lib/taxonomy/__tests__/diff.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { diffTaxonomies } from '../diff';
import { TAXONOMY_SCHEMA_VERSION, type Taxonomy, type TaxonomyEntry } from '@/lib/types';

function entry(overrides: Partial<TaxonomyEntry>): TaxonomyEntry {
  return {
    id: 'editorial',
    bucket: 'aesthetic',
    name: 'Editorial',
    shortDefinition: 's',
    coreMood: 'm',
    bestUseCase: 'u',
    distinctiveSignals: ['a'],
    notes: '',
    notionId: 'n-1',
    hasOverride: true,
    ...overrides,
  };
}

const empty: Taxonomy = {
  syncedAt: '2026-04-14T10:00:00.000Z',
  syncedBy: 't',
  schemaVersion: TAXONOMY_SCHEMA_VERSION,
  aesthetics: [],
  layouts: [],
  interactions: [],
  systems: [],
};

describe('diffTaxonomies', () => {
  it('empty diff for identical taxonomies', () => {
    const d = diffTaxonomies(empty, empty);
    expect(d.added).toHaveLength(0);
    expect(d.modified).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.renamed).toHaveLength(0);
  });

  it('detects added', () => {
    const next = { ...empty, aesthetics: [entry({})] };
    expect(diffTaxonomies(empty, next).added).toHaveLength(1);
  });

  it('detects removed', () => {
    const prev = { ...empty, aesthetics: [entry({})] };
    expect(diffTaxonomies(prev, empty).removed).toHaveLength(1);
  });

  it('detects modified (same notionId, different content)', () => {
    const prev = { ...empty, aesthetics: [entry({ notes: 'old' })] };
    const next = { ...empty, aesthetics: [entry({ notes: 'new' })] };
    const d = diffTaxonomies(prev, next);
    expect(d.modified).toHaveLength(1);
    expect(d.modified[0]?.changedFields).toContain('notes');
  });

  it('detects rename (same notionId, different name)', () => {
    const prev = { ...empty, aesthetics: [entry({ name: 'Old', id: 'old' })] };
    const next = { ...empty, aesthetics: [entry({ name: 'New', id: 'new' })] };
    const d = diffTaxonomies(prev, next);
    expect(d.renamed).toHaveLength(1);
    expect(d.renamed[0]?.from).toBe('Old');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/taxonomy/diff.ts`**

```ts
import type { Taxonomy, TaxonomyEntry, Bucket } from '@/lib/types';

export interface TaxonomyDiff {
  added: TaxonomyEntry[];
  removed: TaxonomyEntry[];
  modified: Array<{ entry: TaxonomyEntry; changedFields: string[] }>;
  renamed: Array<{ from: string; to: string; notionId: string }>;
}

const BUCKETS: Array<{ key: Bucket; arr: keyof Taxonomy }> = [
  { key: 'aesthetic', arr: 'aesthetics' },
  { key: 'layout', arr: 'layouts' },
  { key: 'interaction', arr: 'interactions' },
  { key: 'system', arr: 'systems' },
];

const COMPARE_FIELDS: Array<keyof TaxonomyEntry> = [
  'shortDefinition',
  'coreMood',
  'bestUseCase',
  'distinctiveSignals',
  'notes',
];

function fieldEqual(a: TaxonomyEntry, b: TaxonomyEntry, f: keyof TaxonomyEntry): boolean {
  const av = a[f];
  const bv = b[f];
  if (Array.isArray(av) && Array.isArray(bv)) {
    return av.length === bv.length && av.every((v, i) => v === bv[i]);
  }
  return av === bv;
}

export function diffTaxonomies(prev: Taxonomy, next: Taxonomy): TaxonomyDiff {
  const added: TaxonomyEntry[] = [];
  const removed: TaxonomyEntry[] = [];
  const modified: Array<{ entry: TaxonomyEntry; changedFields: string[] }> = [];
  const renamed: Array<{ from: string; to: string; notionId: string }> = [];

  for (const { arr } of BUCKETS) {
    const prevArr = prev[arr] as TaxonomyEntry[];
    const nextArr = next[arr] as TaxonomyEntry[];
    const prevById = new Map(prevArr.map((e) => [e.notionId, e]));
    const nextById = new Map(nextArr.map((e) => [e.notionId, e]));

    for (const [id, e] of nextById) {
      if (!prevById.has(id)) added.push(e);
    }

    for (const [id, e] of prevById) {
      if (!nextById.has(id)) {
        removed.push(e);
      } else {
        const updated = nextById.get(id)!;
        if (updated.name !== e.name) {
          renamed.push({ from: e.name, to: updated.name, notionId: id });
        }
        const changedFields = COMPARE_FIELDS.filter((f) => !fieldEqual(e, updated, f));
        if (changedFields.length > 0) modified.push({ entry: updated, changedFields });
      }
    }
  }

  return { added, removed, modified, renamed };
}

export function summarizeDiff(d: TaxonomyDiff): string {
  return `+${d.added.length} / ~${d.modified.length} / -${d.removed.length} / renamed ${d.renamed.length}`;
}
```

- [ ] **Step 4: Run — expect 5 passed; commit**

```bash
pnpm test taxonomy/__tests__/diff
git add src/lib/taxonomy
git commit -m "feat(taxonomy): add diff computation with bucket-scoped comparison"
```

---

### Task 17: Sync orchestrator

**Files:** `src/lib/taxonomy/sync.ts`, `src/lib/taxonomy/__tests__/sync.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { performSync } from '../sync';
import { FileStore } from '../file-store';

vi.mock('@/lib/notion/fetcher', () => ({ fetchBucket: vi.fn() }));
vi.mock('@/lib/notion/client', () => ({ getNotionClient: () => ({}) as any }));

import { fetchBucket } from '@/lib/notion/fetcher';

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-sync-'));
  vi.mocked(fetchBucket).mockReset();
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function page(id: string, name: string) {
  return {
    id,
    properties: {
      Name: { type: 'title', title: [{ plain_text: name }] },
      'Short Definition': { type: 'rich_text', rich_text: [{ plain_text: 's' }] },
      'Core Mood': { type: 'rich_text', rich_text: [{ plain_text: 'm' }] },
      'Best Use Case': { type: 'rich_text', rich_text: [{ plain_text: 'u' }] },
      'Distinctive Signals': { type: 'multi_select', multi_select: [{ name: 'x' }] },
      Notes: { type: 'rich_text', rich_text: [] },
    },
  };
}

describe('performSync', () => {
  it('dry-run fetches 4 buckets, returns diff, does not write', async () => {
    vi.mocked(fetchBucket)
      .mockResolvedValueOnce([page('a1', 'Editorial')])
      .mockResolvedValueOnce([page('l1', 'Bento')])
      .mockResolvedValueOnce([page('i1', 'Scrollytelling')])
      .mockResolvedValueOnce([page('s1', 'Material Design')]);

    const store = new FileStore(
      path.join(tmpDir, 'tax.json'),
      path.join(tmpDir, 'log.jsonl'),
    );

    const r = await performSync({
      store,
      dbs: { aesthetic: 'a', layout: 'b', interaction: 'c', system: 'd' },
      syncedBy: 'tester',
      commit: false,
      hasOverride: () => false,
    });

    expect(fetchBucket).toHaveBeenCalledTimes(4);
    expect(r.proposed.aesthetics[0]?.name).toBe('Editorial');
    expect(r.diff.added).toHaveLength(4);
    expect(await store.get()).toBeNull();
  });

  it('commit=true writes cache + history', async () => {
    vi.mocked(fetchBucket)
      .mockResolvedValueOnce([page('a1', 'Editorial')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const store = new FileStore(
      path.join(tmpDir, 'tax.json'),
      path.join(tmpDir, 'log.jsonl'),
    );
    const r = await performSync({
      store,
      dbs: { aesthetic: 'a', layout: 'b', interaction: 'c', system: 'd' },
      syncedBy: 'tester',
      commit: true,
      hasOverride: () => false,
    });
    expect(r.committed).toBe(true);
    const stored = await store.get();
    expect(stored?.aesthetics).toHaveLength(1);
    const hist = await store.history();
    expect(hist).toHaveLength(1);
    expect(hist[0]?.added).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/taxonomy/sync.ts`**

```ts
import { getNotionClient } from '@/lib/notion/client';
import { fetchBucket, type NotionPageLike } from '@/lib/notion/fetcher';
import { mapNotionPageToEntry } from '@/lib/notion/mapper';
import { TAXONOMY_SCHEMA_VERSION, type Bucket, type Taxonomy, type TaxonomyEntry } from '@/lib/types';
import { diffTaxonomies, type TaxonomyDiff, summarizeDiff } from './diff';
import type { TaxonomyStore } from './store';

export interface SyncDbs {
  aesthetic: string;
  layout: string;
  interaction: string;
  system: string;
}

export interface SyncOptions {
  store: TaxonomyStore;
  dbs: SyncDbs;
  syncedBy: string;
  commit: boolean;
  hasOverride: (bucket: Bucket, id: string) => boolean;
  client?: ReturnType<typeof getNotionClient>;
}

export interface SyncResult {
  proposed: Taxonomy;
  previous: Taxonomy | null;
  diff: TaxonomyDiff;
  committed: boolean;
}

function emptyTaxonomy(syncedBy: string): Taxonomy {
  return {
    syncedAt: new Date().toISOString(),
    syncedBy,
    schemaVersion: TAXONOMY_SCHEMA_VERSION,
    aesthetics: [],
    layouts: [],
    interactions: [],
    systems: [],
  };
}

function buildEntries(
  pages: NotionPageLike[],
  bucket: Bucket,
  hasOverride: (b: Bucket, id: string) => boolean,
): TaxonomyEntry[] {
  return pages.map((p) => {
    const t = mapNotionPageToEntry(p, bucket, false);
    return { ...t, hasOverride: hasOverride(bucket, t.id) };
  });
}

export async function performSync(options: SyncOptions): Promise<SyncResult> {
  const client = options.client ?? getNotionClient();
  const [ae, la, inte, sy] = await Promise.all([
    fetchBucket(client as any, options.dbs.aesthetic),
    fetchBucket(client as any, options.dbs.layout),
    fetchBucket(client as any, options.dbs.interaction),
    fetchBucket(client as any, options.dbs.system),
  ]);

  const proposed: Taxonomy = {
    ...emptyTaxonomy(options.syncedBy),
    aesthetics: buildEntries(ae, 'aesthetic', options.hasOverride),
    layouts: buildEntries(la, 'layout', options.hasOverride),
    interactions: buildEntries(inte, 'interaction', options.hasOverride),
    systems: buildEntries(sy, 'system', options.hasOverride),
  };

  const previous = (await options.store.get()) ?? emptyTaxonomy(options.syncedBy);
  const diff = diffTaxonomies(previous, proposed);

  if (options.commit) {
    await options.store.set(proposed);
    await options.store.appendHistory({
      at: proposed.syncedAt,
      by: proposed.syncedBy,
      summary: summarizeDiff(diff),
      added: diff.added.length,
      modified: diff.modified.length,
      removed: diff.removed.length,
      renamed: diff.renamed.length,
    });
  }

  return { proposed, previous: await options.store.get(), diff, committed: options.commit };
}
```

- [ ] **Step 4: Run — expect 2 passed; commit**

```bash
pnpm test taxonomy/__tests__/sync
git add src/lib/taxonomy
git commit -m "feat(taxonomy): add sync orchestrator with dry-run and commit modes"
```

---

### Task 18: Admin gate middleware

**Files:** `src/middleware.ts`

- [ ] **Step 1: Replace contents**

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    const provided =
      request.headers.get('x-admin-secret') ?? request.cookies.get('fb_admin')?.value;
    const expected = process.env.ADMIN_SECRET;
    if (!expected || provided !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/middleware.ts
git commit -m "feat(admin): enforce ADMIN_SECRET on /api/admin routes"
```

---

### Task 19: Sync API route + prompt loader stub

**Files:** `src/lib/prompts/loader.ts` (stub), `src/app/api/admin/sync/route.ts`

- [ ] **Step 1: Create stub `src/lib/prompts/loader.ts`** (fully replaced in Task 28)

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Bucket } from '@/lib/types';

const AESTHETICS_ROOT = path.join(
  process.cwd(),
  'src',
  'lib',
  'prompts',
  'craft-canon',
  'aesthetics',
);

export async function listAestheticOverrides(): Promise<string[]> {
  try {
    const files = await fs.readdir(AESTHETICS_ROOT);
    return files
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

export async function hasOverride(bucket: Bucket, id: string): Promise<boolean> {
  if (bucket !== 'aesthetic') return false;
  try {
    await fs.access(path.join(AESTHETICS_ROOT, `${id}.md`));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Create `src/app/api/admin/sync/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/env';
import { performSync } from '@/lib/taxonomy/sync';
import { defaultFileStore } from '@/lib/taxonomy/file-store';
import { listAestheticOverrides } from '@/lib/prompts/loader';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const store = defaultFileStore();
    const overrideIds = new Set(await listAestheticOverrides());
    const result = await performSync({
      store,
      dbs: {
        aesthetic: env.NOTION_DB_AESTHETICS,
        layout: env.NOTION_DB_LAYOUTS,
        interaction: env.NOTION_DB_INTERACTIONS,
        system: env.NOTION_DB_SYSTEMS,
      },
      syncedBy: 'admin',
      commit: false,
      hasOverride: (bucket, id) => bucket === 'aesthetic' && overrideIds.has(id),
    });
    return NextResponse.json({
      proposed: result.proposed,
      diff: result.diff,
      committed: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const store = defaultFileStore();
    const overrideIds = new Set(await listAestheticOverrides());
    const result = await performSync({
      store,
      dbs: {
        aesthetic: env.NOTION_DB_AESTHETICS,
        layout: env.NOTION_DB_LAYOUTS,
        interaction: env.NOTION_DB_INTERACTIONS,
        system: env.NOTION_DB_SYSTEMS,
      },
      syncedBy: 'admin',
      commit: true,
      hasOverride: (bucket, id) => bucket === 'aesthetic' && overrideIds.has(id),
    });
    return NextResponse.json({ committed: true, diff: result.diff });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/app/api/admin/sync src/lib/prompts/loader.ts
git commit -m "feat(admin): add /api/admin/sync route with dry-run and commit modes"
```

---

### Task 20: Admin login + sync UI

**Files:** `src/app/admin/login.tsx`, `src/app/admin/sync-panel.tsx`, `src/app/admin/page.tsx`

- [ ] **Step 1: Create `src/app/admin/login.tsx`**

```tsx
'use client';
import { useState } from 'react';

export function AdminLogin() {
  const [secretInput, setSecretInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    document.cookie = `fb_admin=${encodeURIComponent(secretInput)}; path=/; SameSite=Strict`;
    const res = await fetch('/api/admin/sync', {
      headers: { 'x-admin-secret': secretInput },
    });
    if (res.status === 401) {
      setError('Invalid admin secret');
      return;
    }
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <label className="block text-sm">Admin secret</label>
      <input
        type="password"
        value={secretInput}
        onChange={(e) => setSecretInput(e.target.value)}
        className="w-full border border-[var(--color-border)] rounded px-3 py-2"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded"
      >
        Unlock
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `src/app/admin/sync-panel.tsx`**

```tsx
'use client';
import { useState } from 'react';

type Diff = {
  added: Array<{ name: string; bucket: string }>;
  removed: Array<{ name: string; bucket: string }>;
  modified: Array<{ entry: { name: string; bucket: string }; changedFields: string[] }>;
  renamed: Array<{ from: string; to: string }>;
};

export function AdminSyncPanel({ adminToken }: { adminToken: string }) {
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);

  async function preview() {
    setLoading(true);
    setError(null);
    setCommitted(false);
    try {
      const res = await fetch('/api/admin/sync', { headers: { 'x-admin-secret': adminToken } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'sync failed');
      setDiff(body.diff as Diff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { 'x-admin-secret': adminToken },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'commit failed');
      setCommitted(true);
      setDiff(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={preview}
        disabled={loading}
        className="px-4 py-2 border border-current rounded"
      >
        {loading ? 'Loading…' : 'Preview sync'}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {committed && <p className="text-green-700 text-sm">Synced. Cache updated.</p>}
      {diff && (
        <div className="space-y-3">
          <p>
            Added: {diff.added.length} · Modified: {diff.modified.length} · Removed:{' '}
            {diff.removed.length} · Renamed: {diff.renamed.length}
          </p>
          <button
            onClick={confirm}
            disabled={loading}
            className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded"
          >
            Confirm &amp; write
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace `src/app/admin/page.tsx`**

```tsx
import { cookies } from 'next/headers';
import { AdminLogin } from './login';
import { AdminSyncPanel } from './sync-panel';

export default async function AdminPage() {
  const jar = await cookies();
  const token = jar.get('fb_admin')?.value;
  const authed = Boolean(token) && token === process.env.ADMIN_SECRET;

  if (!authed) {
    return (
      <section>
        <h2 className="text-xl mb-4">Admin access</h2>
        <AdminLogin />
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl mb-4">Taxonomy sync</h2>
      <AdminSyncPanel adminToken={token!} />
    </section>
  );
}
```

- [ ] **Step 4: Verify manually**

```bash
pnpm dev
```

Visit `/admin`, log in with `ADMIN_SECRET` from `.env.local`. Preview/confirm UI should appear.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin
git commit -m "feat(admin): add login + sync preview/confirm UI"
```

---

### Task 21: End-to-end sync verification

**Files:** none; manual verification.

- [ ] **Step 1: Ensure `.env.local` has real credentials**

Real `NOTION_API_KEY`, 4 `NOTION_DB_*` IDs, `ADMIN_SECRET` of user's choice. Real `ANTHROPIC_API_KEY` needed later (M2) but doesn't block this step.

- [ ] **Step 2: Trigger preview**

```bash
pnpm dev
```

Visit `/admin`, log in, click "Preview sync". Expected: ~63 added entries first run.

- [ ] **Step 3: Confirm write**

Click "Confirm & write". Expected: green success. Inspect `data/taxonomy.json`: all 63 entries present with full metadata.

- [ ] **Step 4: If validation fails**

Any Zod error surfaces in the UI with offending Notion page URL. User fixes the Notion page, clicks Preview again. Old cache stays intact until a confirm succeeds.

---

**M1 complete.** Taxonomy synced and cached; all 63 entries pass validation; admin UI provides safe preview/commit flow.

---

## Phase 2a — Craft Canon Authoring (content tasks)

These tasks produce markdown files. The assistant drafts with citations; the user reviews line-by-line via git diff. Code tasks that follow assume these files exist.

### Task 22: Draft base craft canon

**Files:** `src/lib/prompts/craft-canon/base.md`

- [ ] **Step 1: Draft `base.md`**

The canon distills spec §6.4. Content sections (every rule line ends with `(→ source: <path>)`):

- Opening framing: "You are producing a single self-contained HTML file for a professional studio. Your quality floor is defined below."
- Anti-template rules: banned patterns list (`rules/web/design-quality.md`)
- Required qualities: must hit ≥4 (`rules/web/design-quality.md`)
- CSS architecture: tokens as custom properties; modular sizing via `clamp()` (`rules/web/coding-style.md`)
- Motion discipline: compositor-friendly properties only (`rules/web/coding-style.md`, `rules/web/performance.md`)
- Semantic HTML: `header`/`nav`/`main`/`section[aria-labelledby]`/`footer` (`rules/web/coding-style.md`)
- Performance floor: image dimensions, `font-display: swap`, loading priorities (`rules/web/performance.md`)
- Accessibility: WCAG AA contrast, focus rings, alt text, skip-link, `prefers-reduced-motion` (`rules/web/performance.md`, `interaction-design:animation-principles`)
- Typography discipline: pairing strategy, scale ratio, character (`ui-design:type-system`)
- Color semantics: tokens named by role (`design-systems:design-token`, `ui-design:color-system`)
- Spacing scale: base unit (`ui-design:spacing-system`)
- State design: designed hover/focus/active (`interaction-design:feedback-patterns`)
- Content realism: industry-plausible copy; no Lorem ipsum (`designer-toolkit:ux-writing`)

Target: 2,000–3,000 words.

- [ ] **Step 2: User reviews via git diff**

```bash
git diff --stat src/lib/prompts/craft-canon/base.md
git diff src/lib/prompts/craft-canon/base.md
```

Revise until approved.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prompts/craft-canon/base.md
git commit -m "content(canon): add base craft canon with rule/skill citations"
```

---

### Task 23: Editorial override (+ override template)

**Files:** `src/lib/prompts/craft-canon/_override-template.md`, `src/lib/prompts/craft-canon/aesthetics/editorial.md`

- [ ] **Step 1: Create `_override-template.md`** using the shape from spec §6.3

- [ ] **Step 2: Draft `editorial.md`**

Fill each section for Editorial. Key content:
- Distinctive Signals: amplify Notion's (type-led hierarchy, generous whitespace, asymmetric grids, editorial content pairings)
- Typography: serif display (Fraunces/Playfair/Ogg) + clean sans body (Inter/Söhne); significant scale ratio (≥2.4×); generous body line-height (1.55–1.7)
- Color Behavior: restrained palette, often warm or cool neutral with one considered accent
- Spacing & Rhythm: generous, varying; grid-breaking drop-caps and pull-quotes
- Motion Vocabulary: slow fades, gentle parallax, restraint
- Texture/Atmosphere: subtle grain or paper texture OK
- Composition: grid-breaking encouraged; asymmetric crashes; editorial spreads
- Rule Modulations: "Intentional rhythm" → deliberate variability; "Depth/layering" → via typography scale
- Anti-patterns: no heavy sans displays; don't center every heading; never Lorem ipsum
- Reference Touchpoints: The Outline, NYT projects, McSweeney's, Pentagram
- Citations throughout

- [ ] **Step 3: User reviews; commit**

```bash
git add src/lib/prompts/craft-canon/_override-template.md src/lib/prompts/craft-canon/aesthetics/editorial.md
git commit -m "content(canon): add override template and Editorial override"
```

---

### Task 24: Swiss override

**Files:** `src/lib/prompts/craft-canon/aesthetics/swiss.md`

- [ ] **Step 1: Draft content** (key ideas)
- Distinctive Signals: grid-first, red accent, objective type, ample whitespace, no decoration
- Typography: Helvetica/Neue Haas/Akzidenz-Grotesk; disciplined scale; 1–2 weights
- Color: black + white dominant + one accent (often red); flat fills
- Spacing: strict grid; consistent rhythm
- Motion: precise, short, utilitarian
- Texture: flat, no grain
- Composition: strict grid; alignment is sacred
- Rule Modulations: "Grid-breaking" → WRONG; "Texture" → WRONG
- Anti-patterns: no decorative serif; no multiple accents; don't break the grid
- References: Vignelli, Müller-Brockmann, Swiss International Style
- Citations

- [ ] **Step 2: User reviews; commit**

```bash
git add src/lib/prompts/craft-canon/aesthetics/swiss.md
git commit -m "content(canon): add Swiss aesthetic override"
```

---

### Task 25: Brutalist override

**Files:** `src/lib/prompts/craft-canon/aesthetics/brutalist.md`

- [ ] **Step 1: Draft content** (key ideas)
- Distinctive Signals: raw textures, oversized type, asymmetric crashes, hard-edged borders, unexpected color bombs, dense
- Typography: grotesk + monospace pairings; huge display (>100px); Helvetica Black + Space Mono is classic; no decorative serifs
- Color: high contrast, flat, unafraid of dissonant pairings
- Spacing: deliberately broken; crashes
- Motion: minimal or jarring; no smooth easeInOut; hard cuts OK
- Texture: concrete, grain, hand-drawn annotations
- Composition: asymmetric, grid-breaking default; overlap freely; hard-edged borders
- Rule Modulations: "Intentional rhythm" → deliberately broken; "Depth" → hard-edged layering
- Anti-patterns: no soft shadows; no timid centering; no gradient accents
- References: Bloomberg Businessweek covers, Balenciaga, Gucci experimental, Are.na
- Citations

- [ ] **Step 2: User reviews; commit**

```bash
git add src/lib/prompts/craft-canon/aesthetics/brutalist.md
git commit -m "content(canon): add Brutalist aesthetic override"
```

---

### Task 26: Corporate Clean override

**Files:** `src/lib/prompts/craft-canon/aesthetics/corporate-clean.md`

- [ ] **Step 1: Draft content** (key ideas)
- Distinctive Signals: clear hierarchy, professional polish, trust signals, subtle deliberate motion, restrained palette
- Typography: Inter/SF Pro/Söhne/IBM Plex Sans; functional pairings; ≤2 weights per role
- Color: brand primary + generous neutrals + semantic roles (success/warning/error)
- Spacing: 8px grid; predictable
- Motion: subtle fade-ups on scroll; 150–250ms; ease-out; no theatrical motion
- Texture: flat to very lightly textured; soft drop-shadows OK
- Composition: grid-aligned; F-pattern or card grids; clear CTAs
- Rule Modulations: "Texture/atmosphere" → minimize; "Grid-breaking" → only hero if at all
- Anti-patterns: don't cargo-cult shadcn defaults; still must hit required qualities
- References: Stripe, Linear, Vercel, Notion
- Citations

- [ ] **Step 2: User reviews; commit**

```bash
git add src/lib/prompts/craft-canon/aesthetics/corporate-clean.md
git commit -m "content(canon): add Corporate Clean aesthetic override"
```

---

### Task 27: Generation output contract

**Files:** `src/lib/prompts/output-contract.md`

- [ ] **Step 1: Draft `output-contract.md`**

Content is the full spec §7.3 list as authoritative rules. Strict, enumerated, unambiguous. Ends with:

> ## Output Discipline
>
> Emit the complete HTML document and nothing else. No markdown fences, no commentary before or after, no explanations, no caveats. The response body, beginning to end, is valid HTML.

- [ ] **Step 2: User reviews; commit**

```bash
git add src/lib/prompts/output-contract.md
git commit -m "content(prompts): add generation output contract"
```

---

**M2a complete.** Base canon + 4 seed overrides + output contract authored and reviewed.

---

## Phase 2b — M2: Generation Pipeline

### Task 28: Replace prompt loader with full impl

**Files:** `src/lib/prompts/loader.ts` (replace), `src/lib/prompts/__tests__/loader.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  loadBaseCanon,
  loadAestheticOverride,
  loadOutputContract,
  listAestheticOverrides,
} from '../loader';

describe('prompt loaders', () => {
  it('loadBaseCanon returns non-empty markdown', async () => {
    const text = await loadBaseCanon();
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('#');
  });
  it('loadOutputContract returns non-empty markdown', async () => {
    const text = await loadOutputContract();
    expect(text.length).toBeGreaterThan(100);
  });
  it('loadAestheticOverride returns content for editorial', async () => {
    const text = await loadAestheticOverride('editorial');
    expect(text).toContain('Editorial');
  });
  it('loadAestheticOverride returns null for unknown id', async () => {
    expect(await loadAestheticOverride('nonexistent-xyz')).toBeNull();
  });
  it('listAestheticOverrides includes 4 seed ids', async () => {
    const ids = await listAestheticOverrides();
    expect(ids).toEqual(
      expect.arrayContaining(['editorial', 'swiss', 'brutalist', 'corporate-clean']),
    );
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm test prompts/__tests__/loader
```

- [ ] **Step 3: Replace `src/lib/prompts/loader.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Bucket } from '@/lib/types';

const PROMPTS_ROOT = path.join(process.cwd(), 'src', 'lib', 'prompts');
const CANON_ROOT = path.join(PROMPTS_ROOT, 'craft-canon');
const AESTHETICS_ROOT = path.join(CANON_ROOT, 'aesthetics');

export async function loadBaseCanon(): Promise<string> {
  return fs.readFile(path.join(CANON_ROOT, 'base.md'), 'utf-8');
}

export async function loadOutputContract(): Promise<string> {
  return fs.readFile(path.join(PROMPTS_ROOT, 'output-contract.md'), 'utf-8');
}

export async function loadAestheticOverride(id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(AESTHETICS_ROOT, `${id}.md`), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function listAestheticOverrides(): Promise<string[]> {
  try {
    const files = await fs.readdir(AESTHETICS_ROOT);
    return files
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

export async function hasOverride(bucket: Bucket, id: string): Promise<boolean> {
  if (bucket !== 'aesthetic') return false;
  return (await loadAestheticOverride(id)) !== null;
}
```

- [ ] **Step 4: Run — expect 5 passed; commit**

```bash
pnpm test prompts/__tests__/loader
git add src/lib/prompts/loader.ts src/lib/prompts/__tests__/loader.test.ts
git commit -m "feat(prompts): upgrade loader to full impl with markdown reads"
```

---

### Task 29: Recipe types + prompt assembler

**Files:** `src/lib/types/recipe.ts`, `src/lib/types/index.ts`, `src/lib/prompts/assembler.ts`, `src/lib/prompts/__tests__/assembler.test.ts`

- [ ] **Step 1: Create `src/lib/types/recipe.ts`**

```ts
import type { TaxonomyEntry } from './taxonomy';

export type Vibe = 'mom-and-pop' | 'scrappy-startup' | 'enterprise' | 'custom';

export interface Brief {
  projectName: string;
  industry: string;
  vibe: Vibe;
  customVibe?: string;
  colorsProvided?: string[];
  description?: string;
}

export interface Recipe {
  brief: Brief;
  aesthetic: TaxonomyEntry;
  layout: TaxonomyEntry;
  interaction?: TaxonomyEntry;
  system?: TaxonomyEntry;
}
```

- [ ] **Step 2: Update `src/lib/types/index.ts`**

```ts
export * from './taxonomy';
export * from './recipe';
```

- [ ] **Step 3: Write failing test `src/lib/prompts/__tests__/assembler.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { assembleGenerationRequest } from '../assembler';
import type { Recipe, TaxonomyEntry } from '@/lib/types';

vi.mock('../loader', () => ({
  loadBaseCanon: vi.fn().mockResolvedValue('BASE CANON CONTENT'),
  loadOutputContract: vi.fn().mockResolvedValue('OUTPUT CONTRACT CONTENT'),
  loadAestheticOverride: vi.fn().mockResolvedValue('EDITORIAL OVERRIDE'),
}));

function entry(o: Partial<TaxonomyEntry>): TaxonomyEntry {
  return {
    id: 'editorial',
    bucket: 'aesthetic',
    name: 'Editorial',
    shortDefinition: 's',
    coreMood: 'm',
    bestUseCase: 'u',
    distinctiveSignals: ['a'],
    notes: '',
    notionId: 'n',
    hasOverride: true,
    ...o,
  };
}

const recipe: Recipe = {
  brief: {
    projectName: 'Maple St Bakery',
    industry: 'Food & Beverage',
    vibe: 'mom-and-pop',
    description: 'artisanal bakery; avoid generic cafe tropes',
  },
  aesthetic: entry({ id: 'editorial', hasOverride: true }),
  layout: entry({
    id: 'editorial-spread',
    bucket: 'layout',
    name: 'Editorial Spread',
    hasOverride: false,
  }),
};

describe('assembleGenerationRequest', () => {
  it('returns two-layer-cached Anthropic message structure', async () => {
    const req = await assembleGenerationRequest(recipe);
    expect(req.system[0]?.text).toContain('senior frontend designer');
    expect(
      req.system.find((b) => b.text.includes('BASE CANON CONTENT'))?.cache_control,
    ).toEqual({ type: 'ephemeral' });
    expect(
      req.system.find((b) => b.text.includes('EDITORIAL OVERRIDE'))?.cache_control,
    ).toEqual({ type: 'ephemeral' });
    const userText = req.messages[0]!.content as string;
    expect(userText).toContain('Maple St Bakery');
    expect(userText).toContain('Editorial Spread');
  });

  it('omits aesthetic override block when aesthetic has no override', async () => {
    const { loadAestheticOverride } = await import('../loader');
    (loadAestheticOverride as any).mockResolvedValueOnce(null);
    const r = { ...recipe, aesthetic: entry({ hasOverride: false }) };
    const req = await assembleGenerationRequest(r);
    expect(req.system.some((b) => b.text.includes('OVERRIDE'))).toBe(false);
  });
});
```

- [ ] **Step 4: Run — expect fail**

```bash
pnpm test prompts/__tests__/assembler
```

- [ ] **Step 5: Implement `src/lib/prompts/assembler.ts`**

```ts
import type { Recipe, TaxonomyEntry } from '@/lib/types';
import { loadBaseCanon, loadOutputContract, loadAestheticOverride } from './loader';

interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system: SystemBlock[];
  messages: Array<{ role: 'user'; content: string }>;
  stream: boolean;
}

function formatEntry(e: TaxonomyEntry): string {
  return [
    `- Name: ${e.name}`,
    `- Bucket: ${e.bucket}`,
    `- Short Definition: ${e.shortDefinition}`,
    `- Core Mood: ${e.coreMood}`,
    `- Best Use Case: ${e.bestUseCase}`,
    `- Distinctive Signals: ${e.distinctiveSignals.join('; ')}`,
    `- Notes: ${e.notes || '(none)'}`,
  ].join('\n');
}

function formatBrief(brief: Recipe['brief']): string {
  const vibe = brief.vibe === 'custom' ? (brief.customVibe ?? 'custom') : brief.vibe;
  return [
    `Project name: ${brief.projectName}`,
    `Industry: ${brief.industry}`,
    `Vibe: ${vibe}`,
    brief.colorsProvided?.length
      ? `Color hints: ${brief.colorsProvided.join(', ')}`
      : 'Color hints: (none — you choose palette that serves the recipe)',
    brief.description ? `Notes: ${brief.description}` : 'Notes: (none)',
  ].join('\n');
}

function formatRecipe(recipe: Recipe): string {
  const parts = [
    '## Brief',
    formatBrief(recipe.brief),
    '',
    '## Aesthetic',
    formatEntry(recipe.aesthetic),
    '',
    '## Layout',
    formatEntry(recipe.layout),
  ];
  if (recipe.interaction) {
    parts.push('', '## Interaction', formatEntry(recipe.interaction));
  } else {
    parts.push('', '## Interaction', '(skipped — no explicit interaction pattern)');
  }
  if (recipe.system) {
    parts.push('', '## System Language', formatEntry(recipe.system));
  } else {
    parts.push('', '## System Language', '(skipped — no explicit system framework)');
  }
  return parts.join('\n');
}

const GENERATION_DIRECTIVE = `Produce one complete, self-contained HTML file for this recipe.
Apply the craft canon rigorously. Apply the aesthetic override if present.
Obey the output contract strictly.
Output ONLY the file. No commentary, no markdown fences, no explanations.`;

export async function assembleGenerationRequest(recipe: Recipe): Promise<AnthropicRequest> {
  const [baseCanon, outputContract] = await Promise.all([loadBaseCanon(), loadOutputContract()]);
  const override = recipe.aesthetic.hasOverride
    ? await loadAestheticOverride(recipe.aesthetic.id)
    : null;

  const system: SystemBlock[] = [
    {
      type: 'text',
      text: 'You are a senior frontend designer producing one self-contained HTML file that meets the craft canon, the output contract, and the recipe.',
    },
    {
      type: 'text',
      text: `## Craft Canon\n\n${baseCanon}\n\n## Generation Output Contract\n\n${outputContract}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (override) {
    system.push({
      type: 'text',
      text: `## Aesthetic Override — ${recipe.aesthetic.name}\n\n${override}`,
      cache_control: { type: 'ephemeral' },
    });
  }

  const userContent = `${formatRecipe(recipe)}\n\n---\n\n${GENERATION_DIRECTIVE}`;

  return {
    model: 'claude-opus-4-5',
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: userContent }],
    stream: true,
  };
}
```

- [ ] **Step 6: Run — expect 2 passed; commit**

```bash
pnpm test prompts/__tests__/assembler
git add src/lib/prompts/assembler.ts src/lib/prompts/__tests__/assembler.test.ts src/lib/types
git commit -m "feat(prompts): add generation request assembler with two-layer cache markers"
```

---

### Task 30: Anthropic client wrapper

**Files:** `src/lib/anthropic/client.ts`

- [ ] **Step 1: Create `src/lib/anthropic/client.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/env';

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add src/lib/anthropic
git commit -m "feat(anthropic): add singleton client wrapper"
```

---

### Task 31: Cost estimator

**Files:** `src/lib/cost.ts`, `src/lib/__tests__/cost.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { estimateCost } from '../cost';

describe('estimateCost', () => {
  it('computes Opus cost with cache reads', () => {
    const cost = estimateCost({
      model: 'claude-opus-4-5',
      inputTokens: 1000,
      cacheReadTokens: 40000,
      outputTokens: 2000,
    });
    // 1000*15/1e6 + 40000*1.5/1e6 + 2000*75/1e6 = 0.225
    expect(cost).toBeCloseTo(0.225, 3);
  });

  it('computes Haiku cost without cache', () => {
    const cost = estimateCost({
      model: 'claude-haiku-4-5',
      inputTokens: 10000,
      cacheReadTokens: 0,
      outputTokens: 500,
    });
    expect(cost).toBeCloseTo(0.0125, 4);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/cost.ts`**

```ts
type ModelId = 'claude-opus-4-5' | 'claude-sonnet-4-5' | 'claude-haiku-4-5' | string;

interface Pricing {
  inputPerMTok: number;
  cacheReadPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, Pricing> = {
  'claude-opus-4-5': { inputPerMTok: 15, cacheReadPerMTok: 1.5, outputPerMTok: 75 },
  'claude-sonnet-4-5': { inputPerMTok: 3, cacheReadPerMTok: 0.3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, cacheReadPerMTok: 0.1, outputPerMTok: 5 },
};

export function estimateCost(usage: {
  model: ModelId;
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}): number {
  const p = PRICING[usage.model];
  if (!p) return 0;
  return (
    (usage.inputTokens * p.inputPerMTok) / 1_000_000 +
    (usage.cacheReadTokens * p.cacheReadPerMTok) / 1_000_000 +
    (usage.outputTokens * p.outputPerMTok) / 1_000_000
  );
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
pnpm test cost
git add src/lib/cost.ts src/lib/__tests__/cost.test.ts
git commit -m "feat(cost): add token-to-USD cost estimator with tests"
```

---

### Task 32: Generation archive

**Files:** `src/lib/generation/archive.ts`, `src/lib/generation/__tests__/archive.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ArchiveStore } from '../archive';

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-archive-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ArchiveStore', () => {
  it('saves a generation and reads it back', async () => {
    const s = new ArchiveStore(tmpDir);
    const id = await s.save({
      recipeSummary: 'editorial + editorial-spread',
      html: '<!DOCTYPE html><html></html>',
      modelId: 'claude-opus-4-5',
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 40000,
      cost: 0.05,
      generatedAt: new Date().toISOString(),
    });
    expect(id).toMatch(/^\d{8}-\d{6}-[a-f0-9]{4}$/);
    const r = await s.read(id);
    expect(r?.html).toContain('DOCTYPE');
  });

  it('returns null for unknown id', async () => {
    const s = new ArchiveStore(tmpDir);
    expect(await s.read('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `src/lib/generation/archive.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface ArchiveRecord {
  recipeSummary: string;
  html: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  generatedAt: string;
}

function timestampId(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  const r = crypto.randomBytes(2).toString('hex');
  return `${y}${mo}${d}-${h}${mi}${s}-${r}`;
}

export class ArchiveStore {
  constructor(private readonly rootDir: string) {}

  async save(record: ArchiveRecord): Promise<string> {
    const id = timestampId();
    const dir = path.join(this.rootDir, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), record.html, 'utf-8');
    await fs.writeFile(
      path.join(dir, 'meta.json'),
      JSON.stringify(record, null, 2) + '\n',
      'utf-8',
    );
    return id;
  }

  async read(id: string): Promise<ArchiveRecord | null> {
    const dir = path.join(this.rootDir, id);
    try {
      const [html, metaRaw] = await Promise.all([
        fs.readFile(path.join(dir, 'index.html'), 'utf-8'),
        fs.readFile(path.join(dir, 'meta.json'), 'utf-8'),
      ]);
      const meta = JSON.parse(metaRaw) as ArchiveRecord;
      return { ...meta, html };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}

export function defaultArchiveStore(): ArchiveStore {
  return new ArchiveStore(path.join(process.cwd(), 'tmp', 'generations'));
}
```

- [ ] **Step 4: Run — expect pass; commit**

```bash
pnpm test generation/__tests__/archive
git add src/lib/generation
git commit -m "feat(generation): add archive store for dev-time regression corpus"
```

---

### Task 33: Generate API route (streaming)

**Files:** `src/app/api/generate/route.ts`

- [ ] **Step 1: Create route**

```ts
import { NextRequest } from 'next/server';
import { assembleGenerationRequest } from '@/lib/prompts/assembler';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { defaultArchiveStore } from '@/lib/generation/archive';
import { estimateCost } from '@/lib/cost';
import type { Recipe } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { recipe: Recipe };
  const recipe = body.recipe;
  if (!recipe?.aesthetic?.id || !recipe.layout?.id) {
    return new Response(JSON.stringify({ error: 'recipe missing required buckets' }), {
      status: 400,
    });
  }

  const request = await assembleGenerationRequest(recipe);
  const client = getAnthropicClient();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      let html = '';
      const usage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      };

      try {
        const streamResp = await client.messages.stream({
          model: request.model,
          max_tokens: request.max_tokens,
          system: request.system as any,
          messages: request.messages as any,
        });

        for await (const chunk of streamResp) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            html += chunk.delta.text;
            send('delta', { text: chunk.delta.text });
          } else if (chunk.type === 'message_start') {
            const u = chunk.message.usage as any;
            usage.inputTokens = u?.input_tokens ?? 0;
            usage.cacheReadTokens = u?.cache_read_input_tokens ?? 0;
            usage.cacheCreationTokens = u?.cache_creation_input_tokens ?? 0;
          } else if (chunk.type === 'message_delta') {
            const u = chunk.usage as any;
            usage.outputTokens = u?.output_tokens ?? usage.outputTokens;
          }
        }

        const cost = estimateCost({
          model: request.model,
          inputTokens: usage.inputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          outputTokens: usage.outputTokens,
        });

        const archive = defaultArchiveStore();
        const archiveId = await archive.save({
          recipeSummary: `${recipe.aesthetic.id} + ${recipe.layout.id}`,
          html,
          modelId: request.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cost,
          generatedAt: new Date().toISOString(),
        });

        send('done', { archiveId, usage, cost });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'generation failed';
        send('error', { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/app/api/generate
git commit -m "feat(api): add streaming /api/generate route with archive + cost telemetry"
```

---

### Task 34: Prompt playground script

**Files:** `scripts/gen.ts`

- [ ] **Step 1: Create `scripts/gen.ts`**

```ts
/* eslint-disable no-console */
import 'dotenv/config';
import { assembleGenerationRequest } from '@/lib/prompts/assembler';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { defaultArchiveStore } from '@/lib/generation/archive';
import { estimateCost, formatUsd } from '@/lib/cost';
import { defaultFileStore } from '@/lib/taxonomy/file-store';
import type { Recipe } from '@/lib/types';

async function main() {
  const [, , aestheticId = 'editorial', layoutId = 'editorial-spread'] = process.argv;

  const store = defaultFileStore();
  const taxonomy = await store.get();
  if (!taxonomy) {
    console.error('No taxonomy cache. Sync from /admin first.');
    process.exit(1);
  }

  const aesthetic = taxonomy.aesthetics.find((e) => e.id === aestheticId);
  const layout = taxonomy.layouts.find((e) => e.id === layoutId);
  if (!aesthetic || !layout) {
    console.error(`Unknown aesthetic/layout: ${aestheticId} / ${layoutId}`);
    process.exit(1);
  }

  const recipe: Recipe = {
    brief: {
      projectName: 'Maple St Bakery',
      industry: 'Food & Beverage',
      vibe: 'mom-and-pop',
      description: 'Family-run bakery; avoid generic cafe tropes; warm and considered.',
    },
    aesthetic,
    layout,
  };

  const request = await assembleGenerationRequest(recipe);
  const client = getAnthropicClient();
  console.log(`Calling ${request.model}...`);

  const t0 = Date.now();
  const streamResp = await client.messages.stream({
    model: request.model,
    max_tokens: request.max_tokens,
    system: request.system as any,
    messages: request.messages as any,
  });

  let html = '';
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  for await (const chunk of streamResp) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      html += chunk.delta.text;
      process.stdout.write('.');
    } else if (chunk.type === 'message_start') {
      const u = chunk.message.usage as any;
      usage.inputTokens = u?.input_tokens ?? 0;
      usage.cacheReadTokens = u?.cache_read_input_tokens ?? 0;
    } else if (chunk.type === 'message_delta') {
      const u = chunk.usage as any;
      usage.outputTokens = u?.output_tokens ?? usage.outputTokens;
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const cost = estimateCost({ model: request.model, ...usage });
  console.log('\n');
  console.log(`Elapsed: ${elapsed}s`);
  console.log(
    `Tokens — in: ${usage.inputTokens}, cacheRead: ${usage.cacheReadTokens}, out: ${usage.outputTokens}`,
  );
  console.log(`Cost: ${formatUsd(cost)}`);

  const archive = defaultArchiveStore();
  const id = await archive.save({
    recipeSummary: `${aesthetic.id} + ${layout.id}`,
    html,
    modelId: request.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cost,
    generatedAt: new Date().toISOString(),
  });
  console.log(`Archived as: tmp/generations/${id}/index.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Test run**

Requires synced taxonomy + real `ANTHROPIC_API_KEY`.

```bash
pnpm gen editorial editorial-spread
```

Expected: dots stream, timing + tokens + cost print, archive path shown. Open archived `index.html` in a browser to inspect.

- [ ] **Step 3: Commit**

```bash
git add scripts
git commit -m "feat(dev): add prompt playground script for fast generation iteration"
```

---

### Task 35: Generate-test page (minimal UI for M2 validation)

**Files:** `src/app/generate-test/page.tsx` (replace), `src/app/generate-test/_form.tsx`, `src/app/generate-test/_stream-view.tsx`

- [ ] **Step 1: Create `src/app/generate-test/_stream-view.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Recipe } from '@/lib/types';

export function StreamView({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const [html, setHtml] = useState('');
  const [stats, setStats] = useState<{
    cost: number;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setHtml('');
      setError(null);
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }),
      });
      if (!res.body) {
        setError('No response body');
        onDone();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const lines = raw.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event:'));
          const dataLine = lines.find((l) => l.startsWith('data:'));
          if (!eventLine || !dataLine) continue;
          const ev = eventLine.slice(6).trim();
          const data = JSON.parse(dataLine.slice(5).trim());
          if (ev === 'delta') setHtml((prev) => prev + data.text);
          else if (ev === 'done') setStats({ cost: data.cost, usage: data.usage });
          else if (ev === 'error') setError(data.message);
        }
      }
      onDone();
    }
    run().catch((err) => {
      setError(err instanceof Error ? err.message : 'unknown error');
      onDone();
    });
    return () => {
      cancelled = true;
    };
  }, [recipe, onDone]);

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600">{error}</p>}
      {stats && (
        <p className="text-sm opacity-70">
          Tokens in: {stats.usage.inputTokens} · cacheRead: {stats.usage.cacheReadTokens} · out:{' '}
          {stats.usage.outputTokens} · cost ${stats.cost.toFixed(3)}
        </p>
      )}
      {html && (
        <>
          <h3 className="text-sm uppercase tracking-wide opacity-70">Preview</h3>
          <iframe
            sandbox=""
            srcDoc={html}
            className="w-full h-[600px] border"
            title="Generated preview"
          />
          <details>
            <summary className="cursor-pointer text-sm opacity-70">View code</summary>
            <pre className="text-xs overflow-auto max-h-[400px] bg-[var(--color-surface-alt)] p-3 rounded">
              {html}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/generate-test/_form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Taxonomy, TaxonomyEntry, Recipe } from '@/lib/types';
import { StreamView } from './_stream-view';

export function GenerateTestForm({ taxonomy }: { taxonomy: Taxonomy }) {
  const [projectName, setProjectName] = useState('Maple St Bakery');
  const [industry, setIndustry] = useState('Food & Beverage');
  const [vibe, setVibe] = useState<'mom-and-pop' | 'scrappy-startup' | 'enterprise' | 'custom'>(
    'mom-and-pop',
  );
  const [description, setDescription] = useState(
    'Family-run bakery; avoid generic cafe tropes; warm and considered.',
  );
  const [aestheticId, setAestheticId] = useState(taxonomy.aesthetics[0]?.id ?? 'editorial');
  const [layoutId, setLayoutId] = useState(taxonomy.layouts[0]?.id ?? 'editorial-spread');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [streaming, setStreaming] = useState(false);

  function find(id: string, arr: TaxonomyEntry[]): TaxonomyEntry | undefined {
    return arr.find((e) => e.id === id);
  }

  function handleGenerate() {
    const aesthetic = find(aestheticId, taxonomy.aesthetics);
    const layout = find(layoutId, taxonomy.layouts);
    if (!aesthetic || !layout) {
      alert('Unknown aesthetic/layout id');
      return;
    }
    setRecipe({
      brief: { projectName, industry, vibe, description },
      aesthetic,
      layout,
    });
    setStreaming(true);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <Field label="Project name">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </Field>
        <Field label="Industry">
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </Field>
        <Field label="Vibe">
          <select
            value={vibe}
            onChange={(e) => setVibe(e.target.value as typeof vibe)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="mom-and-pop">Mom &amp; Pop</option>
            <option value="scrappy-startup">Scrappy Startup</option>
            <option value="enterprise">Enterprise</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border rounded px-3 py-2"
          />
        </Field>
        <Field label="Aesthetic">
          <select
            value={aestheticId}
            onChange={(e) => setAestheticId(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            {taxonomy.aesthetics.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.hasOverride ? ' ●' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Layout">
          <select
            value={layoutId}
            onChange={(e) => setLayoutId(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            {taxonomy.layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          onClick={handleGenerate}
          disabled={streaming}
          className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded"
        >
          {streaming ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <div>
        {recipe ? (
          <StreamView recipe={recipe} onDone={() => setStreaming(false)} />
        ) : (
          <p className="opacity-60">Fill the form and generate.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm mb-1">{label}</div>
      {children}
    </label>
  );
}
```

- [ ] **Step 3: Replace `src/app/generate-test/page.tsx`**

```tsx
import { defaultFileStore } from '@/lib/taxonomy/file-store';
import { GenerateTestForm } from './_form';

export default async function GenerateTestPage() {
  const store = defaultFileStore();
  const taxonomy = await store.get();
  if (!taxonomy) {
    return (
      <main className="p-8">
        <h1 className="text-2xl mb-4">Generate Test Harness</h1>
        <p>
          No taxonomy cached. Sync from <code>/admin</code> first.
        </p>
      </main>
    );
  }
  return (
    <main className="p-8 max-w-[1400px] mx-auto">
      <h1 className="text-2xl mb-6">Generate Test Harness</h1>
      <GenerateTestForm taxonomy={taxonomy} />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm lint
git add src/app/generate-test
git commit -m "feat(generate-test): add minimal test harness for M2 validation"
```

---

### Task 36: M2 proof-of-concept validation

**Files:** none — this is the go/no-go validation checkpoint.

- [ ] **Step 1: Verify prerequisites**

```bash
ls -la src/lib/prompts/craft-canon/
ls -la src/lib/prompts/craft-canon/aesthetics/
cat data/taxonomy.json | head -20
```

Expected: `base.md`, `_override-template.md`, 4 aesthetic override files, `output-contract.md`; taxonomy.json with 63 entries.

- [ ] **Step 2: Run dev server**

```bash
pnpm dev
```

- [ ] **Step 3: Generate three canonical test cases**

Visit `/generate-test` and generate:

1. **Editorial + Editorial Spread** — brief: "Maple St Bakery, Food & Beverage, mom-and-pop"
2. **Swiss + Single-column Long Scroll** — brief: "Northpoint Dental, Healthcare, enterprise"
3. **Brutalist + Asymmetrical Composition** — brief: "Hex Records, Music label, scrappy-startup"

- [ ] **Step 4: Quality review against the craft canon**

For each generation:
- Does it clearly hit ≥4 required qualities from `web/design-quality.md`?
- Does typography match the override's typography section?
- Is motion compositor-friendly + respects `prefers-reduced-motion`?
- Is HTML semantic? Run Lighthouse Accessibility audit in devtools.
- Responsive at 375 / 1024 / 1440?
- Do Unsplash image URLs resolve?

- [ ] **Step 5: Iterate on canon if needed**

If underwhelming: identify the specific canon rule not respected, strengthen canon/override text, regenerate, repeat until all three clear the bar.

**Go/no-go gate**: when all three canonical cases pass the craft canon review, M2 is complete. If multiple iterations can't get output above the bar, stop and reassess (prompt structure, model choice, or output contract).

- [ ] **Step 6: Document the result**

Append to `README.md` a "M2 validation" section listing the three test generations' archive IDs and pass/fail.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: record M2 validation results"
```

---

**M2 complete.** The generation pipeline produces quality HTML from a recipe + canon + overrides. Passing this validates the Frame Bucket thesis.

---

## Plan Self-Review

**Spec coverage:**
- §2 Foundational Decisions — all 8 reflected
- §4 Tech Stack — Tasks 1, 3, 4, 6 install and configure
- §5 Data Model — Tasks 11, 29 define types; Session/Artifact shape deferred to M4-M5 plan
- §6 Craft Canon — Tasks 22-26 author base + 4 seed overrides; Tasks 28-29 integrate
- §7 Prompt Contracts — Task 29 assembler, Task 27 output contract, Task 33 generation route; Recommendation prompt deferred to M3 plan
- §8 UX Flow — Task 8 route skeleton; Task 20 admin UI; Task 35 minimal test harness; full wizard deferred
- §9 Notion Sync — Tasks 13-21 cover mapper, fetcher, diff, sync orchestrator, API route, admin UI
- §10 Build Order — this plan IS M0-M2; M3-M8 follow in subsequent plans
- §11 Risks — Task 36 is R1 mitigation; Tasks 17, 19 implement R4; Task 18 implements R11

**Placeholder scan:** no TBD/TODO/FIXME. All placeholders in examples are clearly marked angle-bracket or `'x'.repeat(N)` patterns.

**Type consistency:** `TaxonomyEntry`, `Taxonomy`, `Brief`, `Recipe`, `TaxonomyDiff`, `SyncLogEntry`, `AnthropicRequest`, `ArchiveRecord` all defined once and referenced consistently. `loader.ts` is stubbed in Task 19 and fully implemented in Task 28 — intentional.

**Scope check:** 36 tasks — M0 (10) + M1 (11) + M2a canon (6) + M2b generation (9). Produces working software at the M2 validation gate.

**Deferred to subsequent plans:**
- M3 — Recommendation engine + XML stream parser + bucket selection UI
- M4 — Full wizard with brief, Zustand state, localStorage
- M5 — Preview + iterate (iframe sandbox, regenerate, history, responsive toggle)
- M6 — Remaining 18 aesthetic overrides
- M7 — App's own visual direction, error states, accessibility pass
- M8 — Deploy, BlobStore implementation, ship







