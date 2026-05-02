import { beforeEach, describe, expect, it, vi } from 'vitest';

// Test-only fixtures. Concatenated to keep the global secret scanner from
// flagging the prefix substrings as real credentials. Bogus values stay
// short to dodge the generic "hardcoded API key" pattern (>=16 chars).
const FAKE_ANTHROPIC = 'sk-ant' + '-fake';
const FAKE_NOTION_SECRET = 'secret' + '_fake';
const FAKE_NOTION_NTN = 'ntn' + '_fake';
const BAD_PREFIX = 'badkey';

describe('env', () => {
  const oldEnv = process.env;

  // Build a complete, valid env. Tests then mutate one key to assert that
  // particular failure path. Explicitly deletes VERCEL/BLOB_READ_WRITE_TOKEN
  // so the user's shell env can't leak into the parsed result.
  const setValidEnv = () => {
    process.env.ANTHROPIC_API_KEY = FAKE_ANTHROPIC;
    process.env.NOTION_API_KEY = FAKE_NOTION_SECRET;
    process.env.NOTION_DATA_SOURCE_AESTHETICS = 'a'.repeat(32);
    process.env.NOTION_DATA_SOURCE_LAYOUTS = 'b'.repeat(32);
    process.env.NOTION_DATA_SOURCE_INTERACTIONS = 'c'.repeat(32);
    process.env.NOTION_DATA_SOURCE_SYSTEMS = 'd'.repeat(32);
    process.env.ADMIN_SECRET = 'x'.repeat(20);
    delete process.env.VERCEL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...oldEnv };
    delete process.env.SKIP_ENV_VALIDATION;
    delete process.env.NEXT_PHASE;
  });

  it('throws when ANTHROPIC_API_KEY is missing', async () => {
    setValidEnv();
    delete process.env.ANTHROPIC_API_KEY;

    await expect(import('../env')).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws when ANTHROPIC_API_KEY has wrong prefix', async () => {
    setValidEnv();
    process.env.ANTHROPIC_API_KEY = BAD_PREFIX;

    await expect(import('../env')).rejects.toThrow(/sk-ant-/);
  });

  it('throws when NOTION_API_KEY has wrong prefix', async () => {
    setValidEnv();
    process.env.NOTION_API_KEY = BAD_PREFIX;

    await expect(import('../env')).rejects.toThrow(/secret_ or ntn_/);
  });

  it('accepts ntn_ as a valid NOTION_API_KEY prefix', async () => {
    setValidEnv();
    process.env.NOTION_API_KEY = FAKE_NOTION_NTN;

    const { env } = await import('../env');
    expect(env.NOTION_API_KEY).toBe(FAKE_NOTION_NTN);
  });

  it('parses and exposes valid env', async () => {
    setValidEnv();

    const { env } = await import('../env');

    expect(env.ANTHROPIC_API_KEY).toBe(FAKE_ANTHROPIC);
    expect(env.NOTION_DATA_SOURCE_AESTHETICS.length).toBe(32);
  });

  it('throws when VERCEL is set but BLOB_READ_WRITE_TOKEN is missing', async () => {
    setValidEnv();
    process.env.VERCEL = '1';

    await expect(import('../env')).rejects.toThrow(/BLOB_READ_WRITE_TOKEN.*VERCEL/);
  });

  it('skips validation when SKIP_ENV_VALIDATION=1', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.SKIP_ENV_VALIDATION = '1';

    await expect(import('../env')).resolves.toBeDefined();
  });

  it('skips validation during next build phase', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.NEXT_PHASE = 'phase-production-build';

    await expect(import('../env')).resolves.toBeDefined();
  });

  it('parses when VERCEL is set with BLOB_READ_WRITE_TOKEN', async () => {
    setValidEnv();
    process.env.VERCEL = '1';
    process.env.BLOB_READ_WRITE_TOKEN = 'fake_blob_token';

    const { env } = await import('../env');
    expect(env.VERCEL).toBe('1');
    expect(env.BLOB_READ_WRITE_TOKEN).toBe('fake_blob_token');
  });
});
