import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FilesystemArchiveStore } from '../archive';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-archive-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const baseRecord = {
  recipeSummary: 'editorial + editorial-spread',
  html: '<!DOCTYPE html><html></html>',
  modelId: 'claude-opus-4-7',
  inputTokens: 100,
  outputTokens: 200,
  cacheReadTokens: 40000,
  cost: 0.05,
  generatedAt: new Date().toISOString(),
};

describe('FilesystemArchiveStore', () => {
  it('saves a generation and reads it back', async () => {
    const s = new FilesystemArchiveStore(tmpDir);
    const id = await s.save(baseRecord);
    expect(id).toMatch(/^\d{8}-\d{6}-[a-f0-9]{4}$/);
    const r = await s.read(id);
    expect(r?.html).toContain('DOCTYPE');
    expect(r?.modelId).toBe('claude-opus-4-7');
    expect(r?.cost).toBe(0.05);
  });

  it('returns null for unknown id', async () => {
    const s = new FilesystemArchiveStore(tmpDir);
    expect(await s.read('nope')).toBeNull();
  });

  describe('backward-compatible migration', () => {
    it('loads an old meta.json without iterationRound or parentArtifactId and returns defaults', async () => {
      // Write a legacy meta.json that lacks the new fields
      const legacyId = '20240101-120000-abcd';
      const legacyDir = path.join(tmpDir, legacyId);
      await fs.mkdir(legacyDir, { recursive: true });
      const legacyMeta = {
        recipeSummary: 'editorial + editorial-spread',
        html: '<!DOCTYPE html><html></html>',
        modelId: 'claude-opus-4-7',
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 40000,
        cost: 0.05,
        generatedAt: '2024-01-01T12:00:00.000Z',
      };
      await fs.writeFile(
        path.join(legacyDir, 'meta.json'),
        JSON.stringify(legacyMeta, null, 2) + '\n',
        'utf-8',
      );
      await fs.writeFile(path.join(legacyDir, 'index.html'), legacyMeta.html, 'utf-8');

      const s = new FilesystemArchiveStore(tmpDir);
      const r = await s.read(legacyId);

      expect(r).not.toBeNull();
      expect(r?.iterationRound).toBe(0);
      expect(r?.parentArtifactId).toBeUndefined();
    });
  });

  describe('htmlSource (pre-injection HTML capture)', () => {
    it('persists htmlSource as a separate file and round-trips it through read()', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const id = await s.save({
        ...baseRecord,
        html: '<!DOCTYPE html><html><body><img src="data:image/png;base64,XXX"></body></html>',
        htmlSource: '<!DOCTYPE html><html><body><img src="OPENROUTER:loaf"></body></html>',
      });

      const indexSource = await fs.readFile(path.join(tmpDir, id, 'index-source.html'), 'utf-8');
      expect(indexSource).toContain('OPENROUTER:loaf');

      const r = await s.read(id);
      expect(r?.htmlSource).toContain('OPENROUTER:loaf');
      // html still holds the post-injection version
      expect(r?.html).toContain('data:image/png;base64,');
    });

    it('omits index-source.html when htmlSource is not provided', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const id = await s.save(baseRecord);
      await expect(fs.access(path.join(tmpDir, id, 'index-source.html'))).rejects.toThrow();
      const r = await s.read(id);
      expect(r?.htmlSource).toBeUndefined();
    });
  });

  describe('parent artifact linking', () => {
    it('persists parentArtifactId and iterationRound when saved', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const id = await s.save({
        ...baseRecord,
        parentArtifactId: 'parent-id-001',
        iterationRound: 1,
      });

      const r = await s.read(id);
      expect(r?.parentArtifactId).toBe('parent-id-001');
      expect(r?.iterationRound).toBe(1);
    });

    it('defaults iterationRound to 0 when not provided', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const id = await s.save(baseRecord);
      const r = await s.read(id);
      expect(r?.iterationRound).toBe(0);
    });

    it('appends (iter N) to recipeSummary when iterationRound > 0', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const id = await s.save({ ...baseRecord, iterationRound: 2 });
      const r = await s.read(id);
      expect(r?.recipeSummary).toContain('(iter 2)');
    });

    it('does NOT append (iter N) to recipeSummary when iterationRound is 0', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const id = await s.save(baseRecord);
      const r = await s.read(id);
      expect(r?.recipeSummary).toBe('editorial + editorial-spread');
    });

    it('strips existing (iter N) suffix before adding the new one on re-save', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const id = await s.save({
        ...baseRecord,
        recipeSummary: 'editorial + editorial-spread (iter 1)',
        iterationRound: 2,
      });
      const r = await s.read(id);
      expect(r?.recipeSummary).toBe('editorial + editorial-spread (iter 2)');
    });
  });

  describe('read() type hardening', () => {
    it('coerces a string iterationRound in meta.json to 0', async () => {
      const corruptedId = '20240101-120000-beef';
      const corruptedDir = path.join(tmpDir, corruptedId);
      await fs.mkdir(corruptedDir, { recursive: true });
      const corruptedMeta = {
        recipeSummary: 'editorial + editorial-spread',
        html: '<!DOCTYPE html><html></html>',
        modelId: 'claude-opus-4-7',
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 40000,
        cost: 0.05,
        generatedAt: '2024-01-01T12:00:00.000Z',
        iterationRound: '1',
      };
      await fs.writeFile(
        path.join(corruptedDir, 'meta.json'),
        JSON.stringify(corruptedMeta, null, 2) + '\n',
        'utf-8',
      );
      await fs.writeFile(path.join(corruptedDir, 'index.html'), corruptedMeta.html, 'utf-8');

      const s = new FilesystemArchiveStore(tmpDir);
      const r = await s.read(corruptedId);
      expect(r).not.toBeNull();
      expect(r?.iterationRound).toBe(0);
    });
  });

  describe('getChildren', () => {
    it('returns children sorted by iterationRound ascending', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const parentId = 'parent-abc';

      // Save in non-sequential order: rounds 1, 3, 2
      await s.save({ ...baseRecord, parentArtifactId: parentId, iterationRound: 1 });
      await s.save({ ...baseRecord, parentArtifactId: parentId, iterationRound: 3 });
      await s.save({ ...baseRecord, parentArtifactId: parentId, iterationRound: 2 });

      const children = await s.getChildren(parentId);

      expect(children).toHaveLength(3);
      expect(children.map((c) => c.iterationRound)).toEqual([1, 2, 3]);
    });

    it('attaches each child artifact id to the returned record', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      const parentId = 'parent-with-id';
      const childId = await s.save({
        ...baseRecord,
        parentArtifactId: parentId,
        iterationRound: 1,
      });

      const children = await s.getChildren(parentId);
      expect(children).toHaveLength(1);
      expect(children[0]?.id).toBe(childId);
    });

    it('returns empty array when no children exist', async () => {
      const s = new FilesystemArchiveStore(tmpDir);
      // Save a non-related artifact
      await s.save(baseRecord);

      const children = await s.getChildren('no-such-parent');
      expect(children).toHaveLength(0);
    });
  });
});
