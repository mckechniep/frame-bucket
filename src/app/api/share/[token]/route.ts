import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultShareStore } from '@/lib/shares/share-store-factory';
import { isValidToken } from '@/lib/shares/token';

export const runtime = 'nodejs';

const RenameBody = z.object({
  // Trim BEFORE min/max — see /api/share Task 11 for the discovered ordering bug.
  name: z.string().trim().min(1).max(120),
});

/**
 * PATCH /api/share/[token]
 *
 * Renames an existing share. Used by /shares page (Task 17) and rename
 * mode of the CreateShareModal (Task 14).
 *
 * Rule 4: token shape validated BEFORE any DB lookup. Misshapen tokens
 * return 404 with zero Postgres contact.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!isValidToken(token)) {
    return errorResponse(404, 'NOT_FOUND', 'Share not found');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'INVALID', 'Request body must be JSON');
  }

  const parsed = RenameBody.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'INVALID', parsed.error.issues[0]?.message ?? 'Invalid input');
  }

  const store = defaultShareStore();
  const updated = await store.rename(token, parsed.data.name);
  if (!updated) {
    return errorResponse(404, 'NOT_FOUND', 'Share not found');
  }
  return NextResponse.json({ share: updated });
}

/**
 * DELETE /api/share/[token]
 *
 * Soft-deletes the share by setting revoked_at. Idempotent — re-revoking
 * a revoked share returns the existing record without changing the timestamp
 * (the store handles this; see SupabaseShareStore / MemoryShareStore).
 *
 * Rule 4 same as PATCH.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!isValidToken(token)) {
    return errorResponse(404, 'NOT_FOUND', 'Share not found');
  }

  const store = defaultShareStore();
  const revoked = await store.revoke(token);
  if (!revoked) {
    return errorResponse(404, 'NOT_FOUND', 'Share not found');
  }
  return NextResponse.json({ share: revoked });
}

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
