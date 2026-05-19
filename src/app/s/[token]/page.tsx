import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { defaultShareStore } from '@/lib/shares/share-store-factory';
import { defaultArchiveStore } from '@/lib/generation/archive-factory';
import { isValidToken } from '@/lib/shares/token';
import { trackView } from '@/lib/shares/view-tracking';
import { RevokedView } from './revoked-view';
import { ShareFooter } from './share-footer';

export const runtime = 'nodejs';

// Tell search engines + LLM crawlers not to index share pages.
// The unlisted-URL pattern is the access control; indexing would defeat it.
// Security headers (CSP frame-ancestors, X-Robots-Tag) are added in the
// global middleware (Task 18) — keeping them out of the page component.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Rule 4: validate token shape before any DB lookup.
  if (!isValidToken(token)) notFound();

  const store = defaultShareStore();
  const share = await store.findByToken(token);
  if (!share) notFound();

  // Revoked: show the "removed" state, no iframe, no view tracking.
  if (share.revokedAt) {
    return (
      <>
        <RevokedView name={share.name} revokedAt={share.revokedAt} />
        <ShareFooter />
      </>
    );
  }

  // Active path: fetch the underlying artifact from the archive.
  const archive = defaultArchiveStore();
  const artifact = await archive.read(share.artifactId);
  if (!artifact) {
    // Share exists but artifact gone — show the "missing" variant of revoked.
    return (
      <>
        <RevokedView name={share.name} reason="missing" />
        <ShareFooter />
      </>
    );
  }

  // Rule 5: fire-and-forget view tracking. NEVER awaited in critical path.
  const hdrs = await headers();
  void trackView(store, token, hdrs);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <iframe
        title={`Preview: ${share.name}`}
        srcDoc={artifact.html}
        sandbox="allow-scripts"
        className="absolute inset-0 h-full w-full border-0 bg-white"
      />
      <ShareFooter />
    </main>
  );
}
