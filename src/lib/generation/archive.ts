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

  /**
   * Resolves an artifact id to an absolute directory path, ensuring the
   * result is contained within rootDir. Throws `ARTIFACT_ID_INVALID` if the
   * resolved path would escape rootDir (i.e. a path-traversal attempt).
   *
   * Callers that perform reads (read/exists/existsMany) catch this error and
   * return null/false so traversal ids degrade to "not found" (→ HTTP 404)
   * rather than a 500 or an unintended filesystem access.
   *
   * save() lets the error propagate — a traversal id passed to save() is a
   * programmer error, not a user-controlled 404 case.
   */
  private resolveArtifactDir(id: string): string {
    const dir = path.resolve(this.rootDir, id);
    const root = path.resolve(this.rootDir);
    if (dir !== root && !dir.startsWith(root + path.sep)) {
      throw new Error(`ARTIFACT_ID_INVALID: ${id}`);
    }
    return dir;
  }

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
    // save() uses resolveArtifactDir to be consistent; the id is
    // machine-generated (timestampId) so traversal is impossible here, but
    // containment is still verified for belt-and-suspenders correctness.
    const dir = this.resolveArtifactDir(id);
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
   *
   * A traversal id (e.g. `../../etc/passwd`) returns false rather than
   * throwing — the caller sees "not found" and proceeds normally.
   */
  async exists(id: string): Promise<boolean> {
    let dir: string;
    try {
      dir = this.resolveArtifactDir(id);
    } catch {
      // Traversal id — treat as not found.
      return false;
    }
    const metaPath = path.join(dir, 'meta.json');
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

  /**
   * Reads and returns the archive record for the given id, or null if the
   * artifact does not exist.
   *
   * A traversal id (e.g. `../../etc/passwd`) returns null rather than
   * throwing — the caller sees "not found" (→ HTTP 404) without any
   * unintended filesystem access outside rootDir.
   */
  async read(id: string): Promise<ArchiveRecord | null> {
    let dir: string;
    try {
      dir = this.resolveArtifactDir(id);
    } catch {
      // Traversal id — treat as not found.
      return null;
    }
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
