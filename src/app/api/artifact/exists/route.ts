import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { defaultArchiveStore } from '@/lib/generation/archive';

export const runtime = 'nodejs';

/**
 * POST /api/artifact/exists
 *
 * Read-only existence check for a set of artifact ids. The wizard calls this
 * on session start (after Zustand persist hydrates from localStorage) so it
 * can drop rounds whose archive directories no longer exist on disk — a
 * common case in development where `tmp/generations/` gets wiped between
 * runs while localStorage state survives in the browser.
 *
 * Request:  { artifactIds: string[] }      (max 100)
 * Response: { existing: string[] }         (subset of the input that exists)
 */

const RequestSchema = z.object({
  artifactIds: z.array(z.string().min(1)).max(100),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'malformed JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const archive = defaultArchiveStore();
  const existing = await archive.existsMany(parsed.data.artifactIds);

  return Response.json({
    existing: Array.from(existing),
  });
}
