import { describe, it, expect } from 'vitest';
import { deriveSlug, isValidSlug, SLUG_REGEX, RESERVED_SLUGS } from '../slug';

describe('deriveSlug', () => {
  it('converts title to lowercase and hyphens', () => {
    expect(deriveSlug('About Us')).toBe('/about-us');
  });

  it('handles punctuation and spaces', () => {
    expect(deriveSlug('Pricing & Plans!')).toBe('/pricing-plans');
  });

  it('strips non-ASCII characters', () => {
    expect(deriveSlug('Über uns')).toBe('/ber-uns');
  });

  it('returns /page for empty string', () => {
    expect(deriveSlug('')).toBe('/page');
  });

  it('returns /page for strings with only punctuation/spaces', () => {
    expect(deriveSlug('!!!')).toBe('/page');
    expect(deriveSlug('   ')).toBe('/page');
    expect(deriveSlug('@#$%')).toBe('/page');
  });

  it('truncates to 40 chars total without trailing hyphen', () => {
    const longTitle = 'a'.repeat(60);
    const result = deriveSlug(longTitle);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('-')).toBe(false);
    expect(result.startsWith('/')).toBe(true);
  });

  it('truncates and cleans up trailing hyphens correctly', () => {
    // "a-b-c-d-e-f" repeated enough to exceed 40 chars
    // Should truncate and remove any trailing hyphen
    const title = 'a-b-c-d-e-f '.repeat(10);
    const result = deriveSlug(title);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('-')).toBe(false);
  });

  it('handles single word', () => {
    expect(deriveSlug('Contact')).toBe('/contact');
  });

  it('collapses multiple consecutive hyphens into one', () => {
    expect(deriveSlug('Hello---World')).toBe('/hello-world');
  });

  it('removes leading/trailing spaces and punctuation before slugifying', () => {
    expect(deriveSlug('  About Us  ')).toBe('/about-us');
    expect(deriveSlug('---About Us---')).toBe('/about-us');
  });

  it('handles mixed case and numbers', () => {
    expect(deriveSlug('Section 123 Title')).toBe('/section-123-title');
  });

  it('appends -page to reserved slugs', () => {
    expect(deriveSlug('Shares')).toBe('/shares-page');
    expect(deriveSlug('S')).toBe('/s-page');
    expect(deriveSlug('Admin')).toBe('/admin-page');
  });
});

describe('isValidSlug', () => {
  describe('rejection cases', () => {
    it('rejects null', () => {
      expect(isValidSlug(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isValidSlug(undefined)).toBe(false);
    });

    it('rejects non-string types (number, object, boolean)', () => {
      expect(isValidSlug(123)).toBe(false);
      expect(isValidSlug({})).toBe(false);
      expect(isValidSlug([])).toBe(false);
      expect(isValidSlug(true)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidSlug('')).toBe(false);
    });

    it('rejects string without leading slash', () => {
      expect(isValidSlug('about')).toBe(false);
      expect(isValidSlug('about-us')).toBe(false);
    });

    it('rejects strings with uppercase letters', () => {
      expect(isValidSlug('/About')).toBe(false);
      expect(isValidSlug('/About-Us')).toBe(false);
      expect(isValidSlug('/CONTACT')).toBe(false);
    });

    it('rejects strings with spaces', () => {
      expect(isValidSlug('/ about')).toBe(false);
      expect(isValidSlug('/about us')).toBe(false);
    });

    it('rejects strings with invalid characters (non-alphanumeric, non-hyphen)', () => {
      expect(isValidSlug('/about_us')).toBe(false);
      expect(isValidSlug('/about.us')).toBe(false);
      expect(isValidSlug('/about&us')).toBe(false);
      expect(isValidSlug('/about@us')).toBe(false);
    });

    it('rejects double slashes', () => {
      expect(isValidSlug('//about')).toBe(false);
      expect(isValidSlug('/about//us')).toBe(false);
    });

    it('rejects strings longer than 40 chars', () => {
      const tooLong = '/' + 'a'.repeat(40);
      expect(isValidSlug(tooLong)).toBe(false);
    });

    it('rejects reserved slugs exactly', () => {
      RESERVED_SLUGS.forEach((slug) => {
        expect(isValidSlug(slug)).toBe(false);
      });
    });

    it('rejects strings that start with reserved prefixes', () => {
      expect(isValidSlug('/api/something')).toBe(false);
      expect(isValidSlug('/s/abc')).toBe(false);
      expect(isValidSlug('/admin/dashboard')).toBe(false);
      expect(isValidSlug('/shares/token')).toBe(false);
      expect(isValidSlug('/wizard/step')).toBe(false);
      expect(isValidSlug('/preview/page')).toBe(false);
    });
  });

  describe('acceptance cases', () => {
    it('accepts root slash', () => {
      expect(isValidSlug('/')).toBe(true);
    });

    it('accepts simple lowercase slug', () => {
      expect(isValidSlug('/about')).toBe(true);
      expect(isValidSlug('/contact')).toBe(true);
    });

    it('accepts slug with hyphens', () => {
      expect(isValidSlug('/about-us')).toBe(true);
      expect(isValidSlug('/team-bios')).toBe(true);
    });

    it('accepts slug with numbers', () => {
      expect(isValidSlug('/page-2')).toBe(true);
      expect(isValidSlug('/section-123')).toBe(true);
    });

    it('accepts exactly 40-char slug', () => {
      const slug40 = '/' + 'a'.repeat(39);
      expect(isValidSlug(slug40)).toBe(true);
      expect(slug40.length).toBe(40);
    });

    it('accepts /page', () => {
      expect(isValidSlug('/page')).toBe(true);
    });
  });

  describe('round-trip property', () => {
    it('deriveSlug output is always valid', () => {
      const testCases = [
        'About Us',
        'Pricing & Plans!',
        'Über uns',
        '',
        '!!!',
        'Contact',
        'Section 123 Title',
        'a'.repeat(60),
        'S',
        'Api',
        'Admin',
        'Shares',
        'Wizard',
        'Preview',
      ];

      testCases.forEach((title) => {
        const slug = deriveSlug(title);
        expect(isValidSlug(slug), `deriveSlug('${title}') = '${slug}' should be valid`).toBe(true);
      });
    });
  });

  describe('regex and constants', () => {
    it('SLUG_REGEX matches valid slug patterns', () => {
      expect(SLUG_REGEX.test('/')).toBe(true);
      expect(SLUG_REGEX.test('/about')).toBe(true);
      expect(SLUG_REGEX.test('/about-us')).toBe(true);
      expect(SLUG_REGEX.test('/page-2')).toBe(true);
    });

    it('SLUG_REGEX rejects invalid patterns', () => {
      expect(SLUG_REGEX.test('')).toBe(false);
      expect(SLUG_REGEX.test('about')).toBe(false);
      expect(SLUG_REGEX.test('/About')).toBe(false);
      expect(SLUG_REGEX.test('/about_us')).toBe(false);
      expect(SLUG_REGEX.test('//about')).toBe(false);
    });

    it('RESERVED_SLUGS contains expected values', () => {
      expect(RESERVED_SLUGS).toContain('/api');
      expect(RESERVED_SLUGS).toContain('/s');
      expect(RESERVED_SLUGS).toContain('/admin');
      expect(RESERVED_SLUGS).toContain('/shares');
      expect(RESERVED_SLUGS).toContain('/wizard');
      expect(RESERVED_SLUGS).toContain('/preview');
    });
  });
});
