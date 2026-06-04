import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from '../constants';
import { defaultSettingsStore } from '../store';

// Point the store at a temp file BEFORE the first defaultSettingsStore() call
// (the factory reads FB_SETTINGS_PATH at call time and caches the instance).
const TMP = path.join(os.tmpdir(), `fb-settings-test-${process.pid}.json`);
process.env.FB_SETTINGS_PATH = TMP;

beforeEach(async () => {
  await fs.rm(TMP, { force: true });
});
afterEach(async () => {
  await fs.rm(TMP, { force: true });
});

describe('FileSettingsStore', () => {
  it('returns null when nothing has been saved', async () => {
    expect(await defaultSettingsStore().get()).toBeNull();
  });

  it('round-trips a saved settings object', async () => {
    const next: ModelSettings = {
      ...DEFAULT_MODEL_SETTINGS,
      generate: { model: 'claude-opus-4-8', effort: 'high' },
    };
    await defaultSettingsStore().set(next);
    expect(await defaultSettingsStore().get()).toEqual(next);
  });

  it('rejects an unknown model id', async () => {
    const bad = {
      ...DEFAULT_MODEL_SETTINGS,
      generate: { model: 'gpt-4', effort: 'off' },
    } as ModelSettings;
    await expect(defaultSettingsStore().set(bad)).rejects.toThrow();
  });

  it('rejects an invalid effort level', async () => {
    const bad = {
      ...DEFAULT_MODEL_SETTINGS,
      generate: { model: 'claude-opus-4-8', effort: 'ultra' },
    } as unknown as ModelSettings;
    await expect(defaultSettingsStore().set(bad)).rejects.toThrow();
  });
});
