import { describe, it, expect } from 'vitest';
import { generateShareToken, isValidToken } from '../token';

describe('generateShareToken', () => {
  it('returns a 16-character string', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(16);
  });

  it('contains only base62 characters', () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('produces different tokens across 1000 calls (entropy sanity)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) tokens.add(generateShareToken());
    // Collisions at this entropy level are vanishingly improbable
    expect(tokens.size).toBe(1000);
  });
});

describe('isValidToken', () => {
  it('rejects empty string', () => {
    expect(isValidToken('')).toBe(false);
  });

  it('rejects too-short string (15 chars)', () => {
    expect(isValidToken('A'.repeat(15))).toBe(false);
  });

  it('rejects too-long string (17 chars)', () => {
    expect(isValidToken('A'.repeat(17))).toBe(false);
  });

  it('rejects string containing a dash', () => {
    expect(isValidToken('A'.repeat(15) + '-')).toBe(false);
  });

  it('rejects string containing an underscore', () => {
    expect(isValidToken('A'.repeat(15) + '_')).toBe(false);
  });

  it('rejects string containing unicode', () => {
    expect(isValidToken('A'.repeat(15) + '🐱')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidToken(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidToken(undefined)).toBe(false);
  });

  it('rejects non-string types (number, object)', () => {
    expect(isValidToken(1234567890123456)).toBe(false);
    expect(isValidToken({})).toBe(false);
  });

  it('accepts a valid 16-char base62 string', () => {
    expect(isValidToken('A'.repeat(16))).toBe(true);
    expect(isValidToken('a'.repeat(16))).toBe(true);
    expect(isValidToken('1234567890123456')).toBe(true);
  });

  it('round-trips: every generated token is valid', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidToken(generateShareToken())).toBe(true);
    }
  });
});
