import { type NextRequest, NextResponse } from 'next/server';

import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from '@/lib/settings/constants';
import { ModelSettingsSchema } from '@/lib/settings/schema';
import { defaultSettingsStore } from '@/lib/settings/store';

export const runtime = 'nodejs';

// Auth: /api/admin/* is gated by the proxy (x-admin-secret header OR fb_admin
// cookie), so these handlers can assume an authenticated operator.

export async function GET() {
  const saved = await defaultSettingsStore().get();
  return NextResponse.json({
    settings: saved ?? DEFAULT_MODEL_SETTINGS,
    isDefault: saved === null,
  });
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'malformed JSON body' }, { status: 400 });
  }

  const parsed = ModelSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid settings', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const settings = parsed.data as ModelSettings;
  await defaultSettingsStore().set(settings);
  return NextResponse.json({ settings, isDefault: false });
}
