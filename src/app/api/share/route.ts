import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultShareStore } from '@/lib/shares/share-store-factory';
import { defaultArchiveStore } from '@/lib/generation/archive-factory';

export const runtime = 'nodejs';

const CreateBody = z.object({
  artifactId: z.string().min(1),
  // Order matters: .trim() must run BEFORE .min(1) — otherwise a
  // whitespace-only input passes .min(1) (length > 0 pre-trim) and then
  // gets silently reduced to "". Verified empirically: `.min(1).max(120).trim()`
  // parses "   " as ""; `.trim().min(1).max(120)` rejects it.
  name: z.string().trim().min(1).max(120),
});

/**
 * POST /api/share
 *
 * Creates a new share for an existing artifact. The browser-side wizard
 * (Phase 5d, Task 14) calls this when the user clicks "Create share link."
 *
 * Request:  { artifactId: string, name: string (1..120) }
 * Response: { token, url, name, createdAt }
 *
 * The absolute URL uses NEXT_PUBLIC_APP_URL so the wizard can copy it
 * straight to the clipboard without extra string-building on the client.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'INVALID', 'Request body must be JSON');
  }

  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'INVALID', parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const { artifactId, name } = parsed.data;

  const archive = defaultArchiveStore();
  const exists = await archive.exists(artifactId);
  if (!exists) {
    return errorResponse(404, 'NOT_FOUND', `Artifact ${artifactId} not found`);
  }

  const store = defaultShareStore();
  const share = await store.create({ artifactId, name });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = `${appUrl}/s/${share.token}`;

  return NextResponse.json({
    token: share.token,
    url,
    name: share.name,
    createdAt: share.createdAt,
  });
}

/**
 * GET /api/share
 *
 * Returns all shares (newest first). Used by the /shares management page
 * (Task 17) and the wizard's history sidebar indicator (Task 16).
 *
 * No pagination in M5 — we expect < few hundred shares before M5b reconsiders.
 */
export async function GET(): Promise<NextResponse> {
  const store = defaultShareStore();
  const shares = await store.list();
  return NextResponse.json({ shares });
}

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
