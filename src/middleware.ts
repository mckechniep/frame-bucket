import { NextResponse, type NextRequest } from 'next/server';

/**
 * M5 Task 18 — global auth gate.
 *
 * Production: every path except the public allowlist requires a valid
 * `fb_admin` cookie whose value matches `process.env.ADMIN_SECRET`.
 * Missing or mismatched → 307 redirect to `/admin` (the existing login
 * surface) with `?redirect=<original-pathname>` so future-iterations of
 * the login page can hop the user back to where they were heading.
 *
 * Development (`NODE_ENV !== 'production'`): the cookie gate is a no-op.
 * Local dev never has the cookie set and we'd otherwise have to log into
 * `/admin` on every `pnpm dev` boot. Share-page security headers DO still
 * apply in dev so the local `/s/[token]` surface matches prod behavior.
 *
 * Cookie name verified against `src/app/admin/login.tsx` (sets `fb_admin`)
 * and `src/app/admin/page.tsx` (reads `fb_admin`). Public paths verified:
 *  - `/admin`         — login UI lives at the same path; renders login
 *                       form when the cookie is absent.
 *  - `/api/admin`     — self-gates by header (`x-admin-secret`); the
 *                       initial login round-trip would 401 inside the
 *                       route handler if the secret is wrong, so we
 *                       don't need a cookie at the edge.
 *  - `/s/`            — share viewer is public by design.
 *  - `/`              — landing surface stays reachable.
 *  - `/_next/`        — Next runtime + assets; also excluded by matcher
 *                       below, the in-code check is belt-and-suspenders.
 *  - favicon / robots / sitemap — crawler/asset basics.
 */

const COOKIE_NAME = 'fb_admin';

const PUBLIC_PREFIXES = ['/s/', '/admin', '/api/admin', '/_next/'];
const PUBLIC_EXACT = new Set(['/', '/favicon.ico', '/robots.txt', '/sitemap.xml']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Share-page hardening. Headers layered on top of the per-page
 * `metadata.robots` declaration in `/s/[token]/page.tsx` — the meta tag
 * covers HTML-aware crawlers, the header covers crawlers/proxies that
 * only inspect response headers. Frame-ancestors blocks embedding in
 * a malicious parent page. Referrer-Policy keeps the share URL out of
 * outbound HTTP referers if a viewer clicks a link inside the iframe.
 */
function addShareHeaders(pathname: string, res: NextResponse): NextResponse {
  if (!pathname.startsWith('/s/')) return res;
  res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Dev: no cookie gate, but apply share headers so `/s/*` matches prod.
  if (process.env.NODE_ENV !== 'production') {
    return addShareHeaders(pathname, NextResponse.next());
  }

  if (isPublic(pathname)) {
    return addShareHeaders(pathname, NextResponse.next());
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  // If `ADMIN_SECRET` is unset in prod, the comparison always fails
  // (cookie value can never equal undefined). That's fail-closed: a
  // missing env var locks the app rather than silently disabling auth.
  if (!cookie || cookie !== process.env.ADMIN_SECRET) {
    const loginUrl = new URL('/admin', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return addShareHeaders(pathname, NextResponse.next());
}

/**
 * Matcher excludes Next's static + image optimizer outputs and favicon
 * so the middleware never runs against high-volume asset requests.
 * Everything else is routed through `middleware()` which then decides
 * via `isPublic`.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
