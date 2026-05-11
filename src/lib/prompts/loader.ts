import fs from 'node:fs/promises';
import path from 'node:path';
import type { Bucket } from '@/lib/types';

const PROMPTS_ROOT = path.join(process.cwd(), 'src', 'lib', 'prompts');
const CANON_ROOT = path.join(PROMPTS_ROOT, 'craft-canon');
const AESTHETICS_ROOT = path.join(CANON_ROOT, 'aesthetics');
const RECOMMENDATION_ROOT = path.join(PROMPTS_ROOT, 'recommendation');

export async function loadPosture(): Promise<string> {
  return fs.readFile(path.join(CANON_ROOT, 'posture.md'), 'utf-8');
}

export async function loadBaseCanon(): Promise<string> {
  return fs.readFile(path.join(CANON_ROOT, 'base.md'), 'utf-8');
}

export async function loadOutputContract(): Promise<string> {
  return fs.readFile(path.join(PROMPTS_ROOT, 'output-contract.md'), 'utf-8');
}

export async function loadAestheticOverride(id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(AESTHETICS_ROOT, `${id}.md`), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function loadRecommendationSystemPrompt(): Promise<string> {
  return fs.readFile(path.join(RECOMMENDATION_ROOT, 'system.md'), 'utf-8');
}

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
  return (await loadAestheticOverride(id)) !== null;
}
