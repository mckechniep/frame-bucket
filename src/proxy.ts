import { NextResponse, type NextRequest } from 'next/server';

/**
 * M5 Task 18 — global auth gate + share-page hardening, merged with the
 * pre-existing `/api/admin/*` edge gate that was already in this file.
 *
 * Next 16 renamed `middleware.ts` → `proxy.ts`; the exported function
 * must be named `proxy` (or default-exported). Per the Next docs the
 * Proxy may run at the CDN edge, isolated from the render runtime —
 * so it must NOT import from app/server modules that rely on
 * `globalThis` singletons or shared state. Reading `process.env.*` and
 * inspecting the request is fine; importing `defaultShareStore` would
 * not be.
 *
 * Auth model summary:
 *   - `/api/admin/*`  — its OWN gate (existing behavior). Accepts EITHER
 *                       the `x-admin-secret` header (login bootstrap)
 *                       OR a valid `fb_admin` cookie. 401 on fail.
 *                       Header support is what lets `/admin` log in
 *                       BEFORE the cookie exists.
 *   - `/s/*`          — public viewer; security headers applied (CSP
 *                       frame-ancestors, X-Robots-Tag, Referrer-Policy).
 *   - `/admin*`       — login UI lives here (graceful fallback); public.
 *   - `/`, statics    — public landing surface + asset basics.
 *   - everything else — gated by `fb_admin` cookie in production. Dev
 *                       (`NODE_ENV !== 'production'`) no-ops the cookie
 *                       check so local development does not require a
 *                       login round-trip on every dev-server start.
 *
 * Fail-closed: if `ADMIN_SECRET` is unset in production, all comparisons
 * fail and the app locks down rather than silently disabling auth.
 */

const COOKIE_NAME = 'fb_admin';

const PUBLIC_PREFIXES = ['/s/', '/admin', '/_next/'];
const PUBLIC_EXACT = new Set(['/', '/favicon.ico', '/robots.txt', '/sitemap.xml']);

/**
 * Precise carve-out for the recipient contract download route (Rule 4 / M6 Task 18).
 *
 * /api/share/[token]/contract is PUBLIC so share recipients (who have no admin
 * cookie) can download the design contract files. All other /api/share/* paths
 * remain gated:
 *   - /api/share              (list all shares — operator only)
 *   - /api/share/[token]      (rename / revoke — operator only)
 *   - /api/share/[token]/*    (any other sub-path — not currently defined, but gated)
 *
 * The regex is INTENTIONALLY permissive on the token character set (any
 * alphanumeric run). The route's own isValidToken() (Rule 4) is the real
 * validation gate — it rejects malformed tokens before any DB contact.
 */
const SHARE_CONTRACT_RE = /^\/api\/share\/[A-Za-z0-9]+\/contract$/;

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Recipient contract download — carved out precisely so list/rename/revoke stay gated.
  if (SHARE_CONTRACT_RE.test(pathname)) return true;
  return false;
}

function addShareHeaders(pathname: string, res: NextResponse): NextResponse {
  if (!pathname.startsWith('/s/')) return res;
  res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const expected = process.env.ADMIN_SECRET;

  // /api/admin/* — its own gate. Accepts header OR cookie.
  // Preserved from the previous proxy.ts so the /admin login form,
  // which sends `x-admin-secret` BEFORE a cookie exists, still works.
  if (pathname.startsWith('/api/admin')) {
    const provided = req.headers.get('x-admin-secret') ?? req.cookies.get(COOKIE_NAME)?.value;
    if (!expected || provided !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Dev: no cookie gate, but apply share headers so `/s/*` matches prod.
  if (process.env.NODE_ENV !== 'production') {
    return addShareHeaders(pathname, NextResponse.next());
  }

  if (isPublic(pathname)) {
    return addShareHeaders(pathname, NextResponse.next());
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!expected || !cookie || cookie !== expected) {
    const loginUrl = new URL('/admin', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return addShareHeaders(pathname, NextResponse.next());
}

/**
 * Matcher excludes Next's static + image optimizer outputs and favicon
 * so the proxy never runs against high-volume asset requests. Everything
 * else is routed through `proxy()` which then decides via `isPublic`.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
