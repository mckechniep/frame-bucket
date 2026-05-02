import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/env';
import { performSync } from '@/lib/taxonomy/sync';
import { defaultFileStore } from '@/lib/taxonomy/file-store';
import { listAestheticOverrides } from '@/lib/prompts/loader';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const store = defaultFileStore();
    const overrideIds = new Set(await listAestheticOverrides());
    const result = await performSync({
      store,
      dbs: {
        aesthetic: env.NOTION_DATA_SOURCE_AESTHETICS,
        layout: env.NOTION_DATA_SOURCE_LAYOUTS,
        interaction: env.NOTION_DATA_SOURCE_INTERACTIONS,
        system: env.NOTION_DATA_SOURCE_SYSTEMS,
      },
      syncedBy: 'admin',
      commit: false,
      hasOverride: (bucket, id) => bucket === 'aesthetic' && overrideIds.has(id),
    });
    return NextResponse.json({
      proposed: result.proposed,
      diff: result.diff,
      committed: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const store = defaultFileStore();
    const overrideIds = new Set(await listAestheticOverrides());
    const result = await performSync({
      store,
      dbs: {
        aesthetic: env.NOTION_DATA_SOURCE_AESTHETICS,
        layout: env.NOTION_DATA_SOURCE_LAYOUTS,
        interaction: env.NOTION_DATA_SOURCE_INTERACTIONS,
        system: env.NOTION_DATA_SOURCE_SYSTEMS,
      },
      syncedBy: 'admin',
      commit: true,
      hasOverride: (bucket, id) => bucket === 'aesthetic' && overrideIds.has(id),
    });
    return NextResponse.json({ committed: true, diff: result.diff });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
