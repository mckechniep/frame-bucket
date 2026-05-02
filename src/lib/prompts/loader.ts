import fs from 'node:fs/promises';
import path from 'node:path';
import type { Bucket } from '@/lib/types';

const AESTHETICS_ROOT = path.join(
  process.cwd(),
  'src',
  'lib',
  'prompts',
  'craft-canon',
  'aesthetics',
);

export async function listAestheticOverrides(): Promise<string[]> {
  try {
    const files = await fs.readdir(AESTHETICS_ROOT);
    return files
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

export async function hasOverride(bucket: Bucket, id: string): Promise<boolean> {
  if (bucket !== 'aesthetic') return false;
  try {
    await fs.access(path.join(AESTHETICS_ROOT, `${id}.md`));
    return true;
  } catch {
    return false;
  }
}
