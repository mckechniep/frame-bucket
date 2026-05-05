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

  async save(record: ArchiveRecord): Promise<string> {
    const id = timestampId();
    const dir = path.join(this.rootDir, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), record.html, 'utf-8');
    await fs.writeFile(
      path.join(dir, 'meta.json'),
      JSON.stringify(record, null, 2) + '\n',
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
      const meta = JSON.parse(metaRaw) as ArchiveRecord;
      return { ...meta, html };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}

export function defaultArchiveStore(): ArchiveStore {
  return new ArchiveStore(path.join(process.cwd(), 'tmp', 'generations'));
}
