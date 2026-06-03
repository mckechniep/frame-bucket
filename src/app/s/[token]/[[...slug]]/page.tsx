import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { defaultShareStore } from '@/lib/shares/share-store-factory';
import { defaultArchiveStore } from '@/lib/generation/archive-factory';
import { isValidToken } from '@/lib/shares/token';
import { trackView } from '@/lib/shares/view-tracking';
import { injectNav } from '@/lib/sites/nav-injector';
import { rewriteLinksForShare } from '@/lib/sites/link-rewriter';
import { normalizeSlugParts } from '@/lib/sites/slug';
import { RevokedView } from '../revoked-view';
import { ShareFooter } from '../share-footer';

export const runtime = 'nodejs';

// Tell search engines + LLM crawlers not to index share pages.
// The unlisted-URL pattern is the access control; indexing would defeat it.
// Security headers (CSP frame-ancestors, X-Robots-Tag) are added in the
// global middleware (Task 18) — keeping them out of the page component.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string; slug?: string[] }>;
}) {
  const { token, slug: slugParts } = await params;

  // Rule 4: validate token shape BEFORE any store lookup.
  if (!isValidToken(token)) notFound();

  const store = defaultShareStore();
  const share = await store.findByToken(token);
  if (!share) notFound();

  // Revoked: show the "removed" state, no iframe, no view tracking.
  // We still pass token so the footer can render the contract disclosure.
  if (share.revokedAt) {
    return (
      <>
        <RevokedView name={share.name} revokedAt={share.revokedAt} />
        <ShareFooter />
      </>
    );
  }

  // Resolve which page to serve from the catch-all segments.
  // undefined / [] → landing page slug '/'; ['about'] → '/about'; etc.
  const slug = normalizeSlugParts(slugParts);
  const page = share.pages.find((p) => p.slug === slug);
  if (!page) {
    // Valid share token, but unknown page within this snapshot.
    // Check if there are no pages at all first (missing-content variant).
    if (share.pages.length === 0) {
      return (
        <>
          <RevokedView name={share.name} reason="missing" />
          <ShareFooter token={token} />
        </>
      );
    }
    // Unknown slug within a valid share → 404.
    notFound();
  }

  const archive = defaultArchiveStore();
  const artifact = await archive.read(page.artifactId);
  if (!artifact) {
    // Share exists but artifact is gone — show the "missing" variant.
    return (
      <>
        <RevokedView name={share.name} reason="missing" />
        <ShareFooter token={token} />
      </>
    );
  }

  // Rule 6: nav injection + link rewriting happen on a COPY at serve time.
  // The stored artifact is NEVER mutated.
  //
  // Step 1 — inject nav: rewrites nav-marker region links to /s/<token>/...
  //   URLs and adds target="_top" so nav clicks escape the sandboxed iframe.
  // Step 2 — rewrite in-content links: catches CTA / body-copy anchors
  //   that point at known slugs but live outside the nav marker region.
  const navPages = share.pages.map((p) => ({ slug: p.slug, title: p.title, position: p.position }));
  const shareHref = (s: string) => (s === '/' ? `/s/${token}` : `/s/${token}${s}`);
  let html = injectNav(artifact.html, navPages, slug, { hrefFor: shareHref, targetTop: true });
  html = rewriteLinksForShare(
    html,
    token,
    share.pages.map((p) => p.slug),
  );

  // Rule 5: fire-and-forget view tracking — NEVER awaited in the critical path.
  // Tracked at the share level (not per-page) per the M5/M6 spec.
  const hdrs = await headers();
  void trackView(store, token, hdrs);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/*
       * Sandbox: allow-scripts (the artifact's own JS runs) + allow-top-navigation-by-user-activation
       * (so a recipient CLICK on a rewritten nav link escapes the iframe to /s/<token>/<slug>).
       *
       * NOTE on the threat model: this flag does NOT prevent script-mediated top navigation — a
       * script in the artifact running inside a click handler satisfies the user-activation gate
       * and could redirect window.top. It only blocks UNSOLICITED programmatic navigation with no
       * prior user gesture. This is acceptable here because artifacts are model-generated from
       * operator-controlled prompts, not user-supplied HTML — there is no path for an external
       * attacker to inject artifact content. If that trust boundary ever widens (e.g. user-submitted
       * HTML), switch to a postMessage-based nav shell so the iframe never gets top-nav at all.
       *
       * (No allow-same-origin: srcDoc iframes get an opaque origin, so framed scripts can never
       * reach parent cookies/storage/DOM.)
       */}
      <iframe
        title={`${page.title} — ${share.name}`}
        srcDoc={html}
        sandbox="allow-scripts allow-top-navigation-by-user-activation"
        className="absolute inset-0 h-full w-full border-0 bg-white"
      />
      <ShareFooter token={token} />
    </main>
  );
}
