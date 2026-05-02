import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { performSync } from '../sync';
import { FileStore } from '../file-store';

vi.mock('@/lib/notion/fetcher', () => ({ fetchBucket: vi.fn() }));
vi.mock('@/lib/notion/client', () => ({ getNotionClient: () => ({}) }));

import { fetchBucket } from '@/lib/notion/fetcher';

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-sync-'));
  vi.mocked(fetchBucket).mockReset();
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function page(id: string, name: string) {
  return {
    id,
    properties: {
      Name: { type: 'title', title: [{ plain_text: name }] },
      'Short Definition': { type: 'rich_text', rich_text: [{ plain_text: 's' }] },
      'Core Mood': { type: 'rich_text', rich_text: [{ plain_text: 'm' }] },
      'Best Use Case': { type: 'rich_text', rich_text: [{ plain_text: 'u' }] },
      'Distinctive Signals': { type: 'multi_select', multi_select: [{ name: 'x' }] },
      Notes: { type: 'rich_text', rich_text: [] },
    },
  };
}

describe('performSync', () => {
  it('dry-run fetches 4 buckets, returns diff, does not write', async () => {
    vi.mocked(fetchBucket)
      .mockResolvedValueOnce([page('a1', 'Editorial')])
      .mockResolvedValueOnce([page('l1', 'Bento')])
      .mockResolvedValueOnce([page('i1', 'Scrollytelling')])
      .mockResolvedValueOnce([page('s1', 'Material Design')]);

    const store = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));

    const r = await performSync({
      store,
      dbs: { aesthetic: 'a', layout: 'b', interaction: 'c', system: 'd' },
      syncedBy: 'tester',
      commit: false,
      hasOverride: () => false,
    });

    expect(fetchBucket).toHaveBeenCalledTimes(4);
    expect(r.proposed.aesthetics[0]?.name).toBe('Editorial');
    expect(r.diff.added).toHaveLength(4);
    expect(await store.get()).toBeNull();
  });

  it('commit=true writes cache + history', async () => {
    vi.mocked(fetchBucket)
      .mockResolvedValueOnce([page('a1', 'Editorial')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const store = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));
    const r = await performSync({
      store,
      dbs: { aesthetic: 'a', layout: 'b', interaction: 'c', system: 'd' },
      syncedBy: 'tester',
      commit: true,
      hasOverride: () => false,
    });
    expect(r.committed).toBe(true);
    const stored = await store.get();
    expect(stored?.aesthetics).toHaveLength(1);
    const hist = await store.history();
    expect(hist).toHaveLength(1);
    expect(hist[0]?.added).toBe(1);
  });
});
