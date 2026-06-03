import { describe, it, expect } from 'vitest';
import { isValidArtifactId } from '../artifact-id';

describe('isValidArtifactId', () => {
  describe('valid ids', () => {
    it('accepts a canonical filesystem timestamp id', () => {
      expect(isValidArtifactId('20260602-160516-468c')).toBe(true);
    });

    it('accepts a Supabase UUID', () => {
      expect(isValidArtifactId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    });

    it('accepts a single alphanumeric character', () => {
      expect(isValidArtifactId('a')).toBe(true);
    });

    it('accepts an id exactly 64 chars long', () => {
      expect(isValidArtifactId('a'.repeat(64))).toBe(true);
    });

    it('accepts mixed-case alphanumeric with hyphens', () => {
      expect(isValidArtifactId('AbCd-1234-EfGh')).toBe(true);
    });
  });

  describe('invalid ids — path-traversal vectors', () => {
    it('rejects an id containing a forward slash', () => {
      expect(isValidArtifactId('../../etc/passwd')).toBe(false);
    });

    it('rejects an id containing a dot (relative path segment)', () => {
      expect(isValidArtifactId('../secret')).toBe(false);
    });

    it('rejects an id with a dot separator only', () => {
      expect(isValidArtifactId('foo.bar')).toBe(false);
    });

    it('rejects a percent-encoded traversal sequence', () => {
      // URL-decoded value passed in (Next.js decodes params before route handler)
      expect(isValidArtifactId('..%2F..%2Fetc%2Fpasswd')).toBe(false);
    });

    it('rejects a null-byte injection', () => {
      expect(isValidArtifactId('foo\0bar')).toBe(false);
    });
  });

  describe('invalid ids — shape violations', () => {
    it('rejects an empty string', () => {
      expect(isValidArtifactId('')).toBe(false);
    });

    it('rejects an id longer than 64 chars', () => {
      expect(isValidArtifactId('a'.repeat(65))).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isValidArtifactId(null)).toBe(false);
      expect(isValidArtifactId(undefined)).toBe(false);
      expect(isValidArtifactId(42)).toBe(false);
      expect(isValidArtifactId({})).toBe(false);
    });

    it('rejects an id with a space', () => {
      expect(isValidArtifactId('foo bar')).toBe(false);
    });

    it('rejects an id with an underscore', () => {
      // Underscores are not in the allowed charset for either id format.
      expect(isValidArtifactId('foo_bar')).toBe(false);
    });
  });
});
