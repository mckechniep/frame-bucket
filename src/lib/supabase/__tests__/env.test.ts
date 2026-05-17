import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readServerEnv } from '../env';

const VALID_ENV = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: 'a'.repeat(30),
  SUPABASE_SERVICE_ROLE_KEY: 'b'.repeat(30),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

describe('readServerEnv', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(VALID_ENV)) {
      vi.stubEnv(k, v);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns parsed env when all vars are set with valid values', () => {
    const env = readServerEnv();
    expect(env.SUPABASE_URL).toBe(VALID_ENV.SUPABASE_URL);
    expect(env.SUPABASE_ANON_KEY).toBe(VALID_ENV.SUPABASE_ANON_KEY);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
    expect(env.NEXT_PUBLIC_APP_URL).toBe(VALID_ENV.NEXT_PUBLIC_APP_URL);
  });

  it('throws when SUPABASE_URL is not a valid URL', () => {
    vi.stubEnv('SUPABASE_URL', 'not-a-url');
    expect(() => readServerEnv()).toThrow();
  });

  it('throws when SUPABASE_ANON_KEY is missing', () => {
    delete process.env.SUPABASE_ANON_KEY;
    expect(() => readServerEnv()).toThrow();
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => readServerEnv()).toThrow();
  });

  it('defaults FB_ARCHIVE_BACKEND to "fs" when unset', () => {
    delete process.env.FB_ARCHIVE_BACKEND;
    const env = readServerEnv();
    expect(env.FB_ARCHIVE_BACKEND).toBe('fs');
  });

  it('accepts "supabase" for FB_ARCHIVE_BACKEND', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'supabase');
    const env = readServerEnv();
    expect(env.FB_ARCHIVE_BACKEND).toBe('supabase');
  });

  it('rejects invalid value for FB_ARCHIVE_BACKEND', () => {
    vi.stubEnv('FB_ARCHIVE_BACKEND', 'redis');
    expect(() => readServerEnv()).toThrow();
  });

  it('throws when NEXT_PUBLIC_APP_URL is not a valid URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not-a-url');
    expect(() => readServerEnv()).toThrow();
  });
});
