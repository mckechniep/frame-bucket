import { type NextRequest, NextResponse } from 'next/server';
import { defaultSiteStore } from '@/lib/sites/site-store-factory';
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

/**
 * GET /api/site/[siteId]/contract
 *
 * Admin-gated (cookie protected by proxy in prod). Serves the design contract
 * files for the site's landing page artifact.
 *
 * ?file= must be one of: contract.md | tokens.json | tokens.css
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;

  // ── 1. Validate ?file= param ──────────────────────────────────────────────
  const fileParam = req.nextUrl.searchParams.get('file');
  if (!fileParam || !VALID_FILES.has(fileParam as ContractFile)) {
    return NextResponse.json({ error: 'invalid file param' }, { status: 400 });
  }
  const file = fileParam as ContractFile;

  // ── 2. Site lookup ────────────────────────────────────────────────────────
  const siteStore = defaultSiteStore();
  const site = await siteStore.getSite(siteId);
  if (!site) {
    return NextResponse.json({ error: 'site not found' }, { status: 404 });
  }

  // ── 3. Find landing page ──────────────────────────────────────────────────
  const pages = await siteStore.listPages(siteId);
  const landingPage = pages.find((p) => p.slug === '/');
  if (!landingPage) {
    return NextResponse.json({ error: 'no landing page found for this site' }, { status: 404 });
  }

  // ── 4. Derive contract (cached per artifact) ──────────────────────────────
  const contract = await deriveContract(landingPage.artifactId, site.name);

  // ── 5. Serve the requested file ───────────────────────────────────────────
  const body =
    file === 'contract.md'
      ? contract.contractMd
      : file === 'tokens.json'
        ? contract.tokensJson
        : contract.tokensCss;

  const safePrefix = sanitizeName(site.name);
  const filename = `${safePrefix}-${file}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[file],
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
