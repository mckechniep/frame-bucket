import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContractStore } from './contract-store';
import type { StoredContract } from './types';

/**
 * Filesystem-backed ContractStore.
 *
 * Each contract is stored as a single JSON file:
 *   `<baseDir>/<artifactId>/contract.json`
 *
 * The artifact directory mirrors the layout created by FilesystemArchiveStore
 * (`tmp/generations/<artifactId>/`), so the contract.json file lands alongside
 * the existing meta.json and index.html.
 *
 * Writes are atomic (write-to-temp then rename) to prevent torn files on crash.
 * The entire StoredContract is serialised as-is — no fields are dropped or
 * re-derived, so reads are losslessly round-trip faithful.
 */
export class FsContractStore implements ContractStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), 'tmp', 'generations');
  }

  async get(artifactId: string): Promise<StoredContract | null> {
    const filePath = this.contractPath(artifactId);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    try {
      return JSON.parse(raw) as StoredContract;
    } catch (e) {
      throw new Error(
        `FsContractStore: malformed contract.json at ${filePath}: ${(e as Error).message}`,
      );
    }
  }

  async put(artifactId: string, contract: StoredContract): Promise<void> {
    const artifactDir = path.join(this.baseDir, artifactId);
    // Ensure the artifact directory exists (FilesystemArchiveStore creates it,
    // but in test contexts we may need to create it ourselves).
    await fs.mkdir(artifactDir, { recursive: true });

    const target = this.contractPath(artifactId);
    const tmp = target + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(contract, null, 2) + '\n', 'utf-8');
    await fs.rename(tmp, target); // atomic on same filesystem
  }

  private contractPath(artifactId: string): string {
    return path.join(this.baseDir, artifactId, 'contract.json');
  }
}
