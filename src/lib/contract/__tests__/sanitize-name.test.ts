import { describe, it, expect } from 'vitest';
import { sanitizeName } from '../sanitize-name';

describe('sanitizeName', () => {
  it('lowercases and collapses spaces to dashes', () => {
    expect(sanitizeName('SmokeYard Studio')).toBe('smokeyard-studio');
  });

  it('collapses multiple special chars into a single dash', () => {
    expect(sanitizeName('My Brand! v2.0')).toBe('my-brand-v2-0');
  });

  it('falls back to "site" for an all-symbol input', () => {
    expect(sanitizeName('---')).toBe('site');
  });

  it('falls back to "site" for non-ASCII-only input', () => {
    expect(sanitizeName('北京')).toBe('site');
  });

  it('trims leading punctuation', () => {
    expect(sanitizeName('!!hello')).toBe('hello');
  });

  it('trims trailing punctuation', () => {
    expect(sanitizeName('hello!!')).toBe('hello');
  });

  it('trims both leading and trailing punctuation', () => {
    expect(sanitizeName('---my-site---')).toBe('my-site');
  });

  it('handles a plain lowercase name with no changes needed', () => {
    expect(sanitizeName('acme')).toBe('acme');
  });

  it('falls back to "site" for an empty string', () => {
    expect(sanitizeName('')).toBe('site');
  });
});
