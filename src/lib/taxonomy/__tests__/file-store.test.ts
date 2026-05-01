import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileStore } from '../file-store';
import { TAXONOMY_SCHEMA_VERSION, type Taxonomy } from '@/lib/types';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-filestore-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const example: Taxonomy = {
  syncedAt: '2026-04-14T10:00:00.000Z',
  syncedBy: 'tester',
  schemaVersion: TAXONOMY_SCHEMA_VERSION,
  aesthetics: [],
  layouts: [],
  interactions: [],
  systems: [],
};

describe('FileStore', () => {
  it('returns null when cache does not exist', async () => {
    const s = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));
    expect(await s.get()).toBeNull();
  });

  it('round-trips through set/get', async () => {
    const s = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));
    await s.set(example);
    expect(await s.get()).toEqual(example);
  });

  it('appends history, returns reverse-chronological', async () => {
    const s = new FileStore(path.join(tmpDir, 'tax.json'), path.join(tmpDir, 'log.jsonl'));
    await s.appendHistory({
      at: '2026-04-14T10:00:00.000Z',
      by: 'tester',
      summary: 'first',
      added: 0,
      modified: 0,
      removed: 0,
      renamed: 0,
    });
    await s.appendHistory({
      at: '2026-04-14T11:00:00.000Z',
      by: 'tester',
      summary: 'second',
      added: 1,
      modified: 0,
      removed: 0,
      renamed: 0,
    });
    const entries = await s.history();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.summary).toBe('second');
  });

  it('rejects invalid cache on get (schema mismatch)', async () => {
    const file = path.join(tmpDir, 'tax.json');
    await fs.writeFile(file, JSON.stringify({ bogus: true }));
    const s = new FileStore(file, path.join(tmpDir, 'log.jsonl'));
    await expect(s.get()).rejects.toThrow();
  });
});
