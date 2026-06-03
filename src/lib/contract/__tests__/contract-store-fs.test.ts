import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FsContractStore } from '../contract-store-fs';
import type { StoredContract } from '../types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fb-contracts-test-'));
}

function makeStoredContract(overrides?: Partial<StoredContract>): StoredContract {
  return {
    tokens: {
      colors: [{ name: '--color-primary', value: '#ff0000' }],
      fonts: [{ family: 'Inter', weights: [400, 700], role: 'body' }],
      typeScale: [{ name: '--fs-base', value: '1rem' }],
      spacing: [{ name: '--space-sm', value: '0.5rem' }],
      other: [{ name: '--radius', value: '4px' }],
      meta: { extractedFrom: 'test-artifact', recipeSummary: 'A test site', fallback: false },
    },
    contractMd: '# Design Contract — Test Site\n\n## Identity\nA test identity.',
    tokensJson: JSON.stringify({ color: { primary: { value: '#ff0000' } } }, null, 2),
    tokensCss: ':root {\n  --color-primary: #ff0000;\n}',
    modelId: 'claude-haiku-4-5',
    cost: 0.001234,
    createdAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('FsContractStore', () => {
  describe('get', () => {
    it('returns null for a missing artifact', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const result = await store.get('artifact-does-not-exist');
      expect(result).toBeNull();
    });

    it('returns null when the artifact dir exists but contract.json is missing', async () => {
      const baseDir = makeTmpDir();
      // Create the artifact directory without contract.json
      fs.mkdirSync(path.join(baseDir, 'artifact-no-contract'));
      const store = new FsContractStore(baseDir);
      const result = await store.get('artifact-no-contract');
      expect(result).toBeNull();
    });

    it('throws with the file path in the message when contract.json is malformed JSON', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const artifactDir = path.join(baseDir, 'artifact-malformed');
      fs.mkdirSync(artifactDir);
      fs.writeFileSync(path.join(artifactDir, 'contract.json'), '{ not valid json }', 'utf-8');

      await expect(store.get('artifact-malformed')).rejects.toThrow(
        /FsContractStore: malformed contract\.json at .+artifact-malformed.+contract\.json/,
      );
    });
  });

  describe('put + get round-trip', () => {
    it('round-trips a full StoredContract losslessly', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const contract = makeStoredContract();

      await store.put('artifact-abc', contract);
      const result = await store.get('artifact-abc');

      expect(result).not.toBeNull();
      expect(result?.tokens).toEqual(contract.tokens);
      expect(result?.contractMd).toBe(contract.contractMd);
      expect(result?.tokensJson).toBe(contract.tokensJson);
      expect(result?.tokensCss).toBe(contract.tokensCss);
      expect(result?.modelId).toBe(contract.modelId);
      expect(result?.cost).toBe(contract.cost);
      expect(result?.createdAt).toBe(contract.createdAt);
    });

    it('preserves exact tokensJson string (not re-rendered)', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const customJson = '{"custom":true,"format":"preserved"}';
      const contract = makeStoredContract({ tokensJson: customJson });

      await store.put('artifact-json', contract);
      const result = await store.get('artifact-json');

      expect(result?.tokensJson).toBe(customJson);
    });

    it('stores contract in <baseDir>/<artifactId>/contract.json', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const contract = makeStoredContract();

      await store.put('artifact-xyz', contract);

      const filePath = path.join(baseDir, 'artifact-xyz', 'contract.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('put is idempotent — second put overwrites the first', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const v1 = makeStoredContract({ modelId: 'model-v1', cost: 0.001 });
      const v2 = makeStoredContract({ modelId: 'model-v2', cost: 0.002 });

      await store.put('artifact-overwrite', v1);
      await store.put('artifact-overwrite', v2);
      const result = await store.get('artifact-overwrite');

      expect(result?.modelId).toBe('model-v2');
      expect(result?.cost).toBe(0.002);
    });

    it('creates the artifact subdirectory if it does not exist', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const contract = makeStoredContract();

      // Directory should NOT exist before put
      const artifactDir = path.join(baseDir, 'artifact-newdir');
      expect(fs.existsSync(artifactDir)).toBe(false);

      await store.put('artifact-newdir', contract);
      expect(fs.existsSync(artifactDir)).toBe(true);
    });

    it('round-trips a fallback contract (meta.fallback = true)', async () => {
      const baseDir = makeTmpDir();
      const store = new FsContractStore(baseDir);
      const contract = makeStoredContract({
        tokens: {
          colors: [],
          fonts: [],
          typeScale: [],
          spacing: [],
          other: [],
          meta: { extractedFrom: 'fallback-test', recipeSummary: '', fallback: true },
        },
        modelId: '',
        cost: 0,
      });

      await store.put('artifact-fallback', contract);
      const result = await store.get('artifact-fallback');

      expect(result?.tokens.meta.fallback).toBe(true);
      expect(result?.tokens.colors).toEqual([]);
    });
  });
});
