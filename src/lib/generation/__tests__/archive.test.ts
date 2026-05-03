import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ArchiveStore } from '../archive';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-archive-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ArchiveStore', () => {
  it('saves a generation and reads it back', async () => {
    const s = new ArchiveStore(tmpDir);
    const id = await s.save({
      recipeSummary: 'editorial + editorial-spread',
      html: '<!DOCTYPE html><html></html>',
      modelId: 'claude-opus-4-7',
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 40000,
      cost: 0.05,
      generatedAt: new Date().toISOString(),
    });
    expect(id).toMatch(/^\d{8}-\d{6}-[a-f0-9]{4}$/);
    const r = await s.read(id);
    expect(r?.html).toContain('DOCTYPE');
    expect(r?.modelId).toBe('claude-opus-4-7');
    expect(r?.cost).toBe(0.05);
  });

  it('returns null for unknown id', async () => {
    const s = new ArchiveStore(tmpDir);
    expect(await s.read('nope')).toBeNull();
  });
});
