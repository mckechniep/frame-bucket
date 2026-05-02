import fs from 'node:fs/promises';
import path from 'node:path';
import { TaxonomySchema } from '@/lib/schemas';
import type { Taxonomy } from '@/lib/types';
import type { TaxonomyStore, SyncLogEntry } from './store';

export class FileStore implements TaxonomyStore {
  constructor(
    private readonly dataPath: string,
    private readonly logPath: string,
  ) {}

  async get(): Promise<Taxonomy | null> {
    try {
      const raw = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return TaxonomySchema.parse(parsed);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async set(taxonomy: Taxonomy): Promise<void> {
    const validated = TaxonomySchema.parse(taxonomy);
    await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
    await fs.writeFile(this.dataPath, JSON.stringify(validated, null, 2) + '\n', 'utf-8');
  }

  async history(limit = 50): Promise<SyncLogEntry[]> {
    try {
      const raw = await fs.readFile(this.logPath, 'utf-8');
      const entries = raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SyncLogEntry);
      return entries.reverse().slice(0, limit);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async appendHistory(entry: SyncLogEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n', 'utf-8');
  }
}

export function defaultFileStore(): FileStore {
  const root = process.cwd();
  return new FileStore(
    path.join(root, 'data', 'taxonomy.json'),
    path.join(root, 'data', 'sync-log.jsonl'),
  );
}
