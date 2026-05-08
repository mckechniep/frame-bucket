import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface ArchiveRecord {
  recipeSummary: string;
  html: string;
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

export class ArchiveStore {
  constructor(private readonly rootDir: string) {}

  async save(
    record: Omit<ArchiveRecord, 'iterationRound'> & Partial<Pick<ArchiveRecord, 'iterationRound'>>,
  ): Promise<string> {
    const iterationRound = record.iterationRound ?? 0;
    const recipeSummary =
      iterationRound > 0
        ? `${record.recipeSummary} (iter ${iterationRound})`
        : record.recipeSummary;
    const fullRecord: ArchiveRecord = {
      ...record,
      iterationRound,
      recipeSummary,
    };
    const id = timestampId();
    const dir = path.join(this.rootDir, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), fullRecord.html, 'utf-8');
    await fs.writeFile(
      path.join(dir, 'meta.json'),
      JSON.stringify(fullRecord, null, 2) + '\n',
      'utf-8',
    );
    return id;
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
        modelId: raw.modelId ?? '',
        inputTokens: raw.inputTokens ?? 0,
        outputTokens: raw.outputTokens ?? 0,
        cacheReadTokens: raw.cacheReadTokens ?? 0,
        cost: raw.cost ?? 0,
        generatedAt: raw.generatedAt ?? '',
        iterationRound: raw.iterationRound ?? 0,
        parentArtifactId: raw.parentArtifactId,
      };
      return { ...meta, html };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async getChildren(parentId: string): Promise<ArchiveRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.rootDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const results: ArchiveRecord[] = [];
    await Promise.all(
      entries.map(async (entry) => {
        const record = await this.read(entry);
        if (record?.parentArtifactId === parentId) {
          results.push(record);
        }
      }),
    );

    return results.sort((a, b) => a.iterationRound - b.iterationRound);
  }
}

export function defaultArchiveStore(): ArchiveStore {
  return new ArchiveStore(path.join(process.cwd(), 'tmp', 'generations'));
}
