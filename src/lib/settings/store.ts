import fs from 'node:fs/promises';
import path from 'node:path';

import type { ModelSettings } from './constants';
import { ModelSettingsSchema } from './schema';

export interface SettingsStore {
  /** Returns the persisted settings, or null if none have been saved yet. */
  get(): Promise<ModelSettings | null>;
  /** Validates and persists the full settings object. */
  set(settings: ModelSettings): Promise<void>;
}

/**
 * Filesystem-backed settings store (dev / single-instance). Mirrors the
 * taxonomy file-store pattern: a single validated JSON document.
 *
 * NOTE: a Supabase-backed implementation is deferred along with the parked
 * production deploy (M6 Phase 6h). On serverless the filesystem is ephemeral,
 * so when deploy is un-parked, add a SupabaseSettingsStore and switch on
 * FB_ARCHIVE_BACKEND here — exactly like the archive/site stores.
 */
class FileSettingsStore implements SettingsStore {
  constructor(private readonly filePath: string) {}

  async get(): Promise<ModelSettings | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return ModelSettingsSchema.parse(JSON.parse(raw)) as ModelSettings;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async set(settings: ModelSettings): Promise<void> {
    const validated = ModelSettingsSchema.parse(settings);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(validated, null, 2) + '\n', 'utf-8');
  }
}

let cached: SettingsStore | null = null;

export function defaultSettingsStore(): SettingsStore {
  if (!cached) {
    const filePath =
      process.env.FB_SETTINGS_PATH ?? path.join(process.cwd(), 'tmp', 'settings.json');
    cached = new FileSettingsStore(filePath);
  }
  return cached;
}
