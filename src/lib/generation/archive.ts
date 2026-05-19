import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ArchiveStore } from './archive-interface';
export { defaultArchiveStore } from './archive-factory';

export interface ArchiveRecord {
  recipeSummary: string;
  /**
   * Final HTML served to viewers — image placeholders have been replaced with
   * inline base64 data URIs. Can be 10MB+ once images are injected.
   */
  html: string;
  /**
   * Pre-injection HTML, with `src="OPENROUTER:<prompt>"` placeholders intact.
   * This is the model's actual output, before injectImages bloats it. Used as
   * the previous-HTML input for iteration so we don't ship megabytes of base64
   * back to the API. Optional for backward compatibility with archives saved
   * before the source-capture change landed.
   */
  htmlSource?: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  generatedAt: string;
  parentArtifactId?: string;
  iterationRound: number;
}

function timestampId(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  const r = crypto.randomBytes(2).toString('hex');
  return `${y}${mo}${d}-${h}${mi}${s}-${r}`;
}

function stripIterSuffix(summary: string): string {
  return summary.replace(/\s*\(iter \d+\)\s*$/, '');
}

export class FilesystemArchiveStore implements ArchiveStore {
  constructor(private readonly rootDir: string) {}

  async save(
    record: Omit<ArchiveRecord, 'iterationRound'> & Partial<Pick<ArchiveRecord, 'iterationRound'>>,
  ): Promise<string> {
    const iterationRound = record.iterationRound ?? 0;
    const baseSummary = stripIterSuffix(record.recipeSummary);
    const recipeSummary =
      iterationRound > 0 ? `${baseSummary} (iter ${iterationRound})` : baseSummary;
    const fullRecord: ArchiveRecord = {
      ...record,
      iterationRound,
      recipeSummary,
    };
    const id = timestampId();
    const dir = path.join(this.rootDir, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), fullRecord.html, 'utf-8');
    if (fullRecord.htmlSource) {
      await fs.writeFile(path.join(dir, 'index-source.html'), fullRecord.htmlSource, 'utf-8');
    }
    // meta.json keeps a copy of htmlSource too for ergonomic single-file reads;
    // index-source.html is the human-friendly mirror.
    await fs.writeFile(
      path.join(dir, 'meta.json'),
      JSON.stringify(fullRecord, null, 2) + '\n',
      'utf-8',
    );
    return id;
  }

  /**
   * Cheap existence check — only stats the artifact's meta.json. Used by the
   * wizard's hydrate-and-validate path on session start so we can drop
   * persisted rounds whose archive directories were wiped (common in dev).
   */
  async exists(id: string): Promise<boolean> {
    const metaPath = path.join(this.rootDir, id, 'meta.json');
    try {
      await fs.access(metaPath);
      return true;
    } catch {
      return false;
    }
  }

  async existsMany(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const results = await Promise.all(
      ids.map(async (id) => ({ id, exists: await this.exists(id) })),
    );
    return new Set(results.filter((r) => r.exists).map((r) => r.id));
  }

  async read(id: string): Promise<ArchiveRecord | null> {
    const dir = path.join(this.rootDir, id);
    try {
      const [html, metaRaw] = await Promise.all([
        fs.readFile(path.join(dir, 'index.html'), 'utf-8'),
        fs.readFile(path.join(dir, 'meta.json'), 'utf-8'),
      ]);
      const raw = JSON.parse(metaRaw) as Partial<ArchiveRecord>;
      const meta: ArchiveRecord = {
        ...raw,
        recipeSummary: raw.recipeSummary ?? '',
        html: raw.html ?? '',
        htmlSource: typeof raw.htmlSource === 'string' ? raw.htmlSource : undefined,
        modelId: raw.modelId ?? '',
        inputTokens: raw.inputTokens ?? 0,
        outputTokens: raw.outputTokens ?? 0,
        cacheReadTokens: raw.cacheReadTokens ?? 0,
        cost: raw.cost ?? 0,
        generatedAt: raw.generatedAt ?? '',
        iterationRound: typeof raw.iterationRound === 'number' ? raw.iterationRound : 0,
        parentArtifactId: raw.parentArtifactId,
      };
      return { ...meta, html };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async getChildren(parentId: string): Promise<Array<ArchiveRecord & { id: string }>> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.rootDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const results: Array<ArchiveRecord & { id: string }> = [];
    await Promise.all(
      entries.map(async (entry) => {
        const record = await this.read(entry);
        if (record?.parentArtifactId === parentId) {
          results.push({ ...record, id: entry });
        }
      }),
    );

    return results.sort((a, b) => a.iterationRound - b.iterationRound);
  }
}
