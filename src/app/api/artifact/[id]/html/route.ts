import { defaultArchiveStore } from '@/lib/generation/archive';
import { isValidArtifactId } from '@/lib/generation/artifact-id';

export const runtime = 'nodejs';

/**
 * GET /api/artifact/[id]/html
 *
 * Returns the raw stored HTML for an artifact. Used by the wizard preview
 * (`PagePreviewFrame`) to fetch the HTML string so it can inject the current
 * site nav client-side via srcDoc — giving the operator an honest WYSIWYG
 * preview that reflects the full multi-page nav structure.
 *
 * Operator-only: gated by the `fb_admin` cookie in production (the proxy
 * treats all non-public paths as operator-only). Dev: no-op gate.
 *
 * The raw HTML is rendered in a sandboxed `allow-scripts` srcDoc iframe
 * on the client — same trust model as the existing /preview/[id] route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: 'artifact id is required' }, { status: 400 });
  }

  // Defense-in-depth: reject ids that don't match the canonical shape
  // ([A-Za-z0-9-], ≤ 64 chars) before they reach the archive store.
  // A traversal attempt like `../../etc/passwd` is treated as not-found (404)
  // rather than forwarded to the fs layer. Mirrors isValidToken() style.
  if (!isValidArtifactId(id)) {
    return Response.json({ error: 'artifact not found' }, { status: 404 });
  }

  const artifact = await defaultArchiveStore().read(id);

  if (!artifact) {
    return Response.json({ error: 'artifact not found' }, { status: 404 });
  }

  return new Response(artifact.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
