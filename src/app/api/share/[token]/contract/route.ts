import { type NextRequest, NextResponse } from 'next/server';
import { defaultShareStore } from '@/lib/shares/share-store-factory';
import { defaultSiteStore } from '@/lib/sites/site-store-factory';
import { isValidToken } from '@/lib/shares/token';
import { deriveContract } from '@/lib/contract/derive';
import { sanitizeName } from '@/lib/contract/sanitize-name';

export const runtime = 'nodejs';

/**
 * Allowed values for the ?file= query param.
 */
const VALID_FILES = new Set(['contract.md', 'tokens.json', 'tokens.css'] as const);
type ContractFile = 'contract.md' | 'tokens.json' | 'tokens.css';

/**
 * Map each file to its Content-Type.
 */
const CONTENT_TYPES: Record<ContractFile, string> = {
  'contract.md': 'text/markdown; charset=utf-8',
  'tokens.json': 'application/json; charset=utf-8',
  'tokens.css': 'text/css; charset=utf-8',
};

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * GET /api/share/[token]/contract
 *
 * PUBLIC — Rule 4 enforced (token validated BEFORE any store/DB contact).
 * Recipients download the design contract from a share link without needing
 * the admin cookie. The proxy carve-out in proxy.ts allows this path through
 * while keeping all other /api/share/* paths gated.
 *
 * ?file= must be one of: contract.md | tokens.json | tokens.css
 *
 * X-Robots-Tag: noindex is set so search engines don't index contract files.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // ── 1. Rule 4 — validate token shape BEFORE any store/DB call ────────────
  if (!isValidToken(token)) {
    return errorResponse(404, 'NOT_FOUND', 'Share not found');
  }

  // ── 2. Validate ?file= param ──────────────────────────────────────────────
  const fileParam = req.nextUrl.searchParams.get('file');
  if (!fileParam || !VALID_FILES.has(fileParam as ContractFile)) {
    return errorResponse(400, 'INVALID', 'invalid file param');
  }
  const file = fileParam as ContractFile;

  // ── 3. Share lookup ───────────────────────────────────────────────────────
  const share = await defaultShareStore().findByToken(token);
  if (!share) {
    return errorResponse(404, 'NOT_FOUND', 'Share not found');
  }

  // ── 4. Revocation check ───────────────────────────────────────────────────
  if (share.revokedAt) {
    return NextResponse.json({ error: 'this preview has been revoked' }, { status: 410 });
  }

  // ── 5. Find landing page in the share snapshot ────────────────────────────
  const landing = share.pages.find((p) => p.slug === '/');
  if (!landing) {
    return NextResponse.json({ error: 'no landing page found in this share' }, { status: 404 });
  }

  // ── 6. Resolve site name for filename sanitization ────────────────────────
  // The share snapshot doesn't carry the site name — fetch it from the site
  // store. deriveContract is cached per-artifact, so this reuses the
  // operator's already-derived contract with no extra LLM cost.
  const site = await defaultSiteStore().getSite(share.siteId);
  const siteName = site?.name ?? 'site';

  // ── 7. Derive contract (cached per artifact) ──────────────────────────────
  const contract = await deriveContract(landing.artifactId, siteName);

  // ── 8. Serve the requested file ───────────────────────────────────────────
  const body =
    file === 'contract.md'
      ? contract.contractMd
      : file === 'tokens.json'
        ? contract.tokensJson
        : contract.tokensCss;

  const safePrefix = sanitizeName(siteName);
  const filename = `${safePrefix}-${file}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[file],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Robots-Tag': 'noindex',
    },
  });
}
