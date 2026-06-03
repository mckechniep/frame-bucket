import { describe, it, expect } from 'vitest';
import { rewriteLinksForShare } from '../link-rewriter';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const TKN = 'TKN';
const KNOWN_SLUGS = ['/', '/about', '/contact'];

function page(body: string): string {
  return `<!DOCTYPE html><html><body>${body}</body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Root slug "/"
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — root slug', () => {
  it('rewrites href="/" to /s/TKN and adds target="_top"', () => {
    const html = page('<a href="/">Home</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toContain('href="/s/TKN"');
    expect(result).toContain('target="_top"');
    expect(result).not.toContain('href="/"');
  });

  it("rewrites single-quoted href='/' correctly", () => {
    const html = page("<a href='/'>Home</a>");
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toContain('href="/s/TKN"');
    expect(result).toContain('target="_top"');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Non-root slug
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — non-root slug', () => {
  it('rewrites href="/about" to /s/TKN/about and adds target="_top"', () => {
    const html = page('<a href="/about">About</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toContain('href="/s/TKN/about"');
    expect(result).toContain('target="_top"');
    expect(result).not.toContain('href="/about"');
  });

  it("rewrites single-quoted href='/about' correctly", () => {
    const html = page("<a href='/about'>About</a>");
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toContain('href="/s/TKN/about"');
    expect(result).toContain('target="_top"');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Existing target attribute — no duplication
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — existing target attribute', () => {
  it('does not duplicate target when anchor already has target="_blank"', () => {
    const html = page('<a href="/about" target="_blank">About</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    // Should have exactly one target attribute
    const anchorMatch = /<a\b[^>]*>/.exec(result);
    const tag = anchorMatch?.[0] ?? '';
    const count = (tag.match(/\btarget=/g) ?? []).length;
    expect(count).toBe(1);
    expect(tag).toContain('target="_top"');
  });

  it('does not duplicate target when anchor already has target="_top"', () => {
    const html = page('<a href="/about" target="_top">About</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    const anchorMatch = /<a\b[^>]*>/.exec(result);
    const tag = anchorMatch?.[0] ?? '';
    const count = (tag.match(/\btarget=/g) ?? []).length;
    expect(count).toBe(1);
    expect(tag).toContain('target="_top"');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Untouched hrefs — external / anchor / mailto / tel
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — untouched hrefs', () => {
  it('leaves external https:// links untouched', () => {
    const html = page('<a href="https://external.com">External</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toBe(html);
  });

  it('leaves #section anchor links untouched', () => {
    const html = page('<a href="#section">Jump</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toBe(html);
  });

  it('leaves mailto: links untouched', () => {
    const html = page('<a href="mailto:x@y.com">Email</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toBe(html);
  });

  it('leaves tel: links untouched', () => {
    const html = page('<a href="tel:+1">Call</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toBe(html);
  });

  it('leaves a relative path not in knownSlugs untouched', () => {
    const html = page('<a href="/contact">Contact</a>');
    // knownSlugs does NOT include /contact
    const result = rewriteLinksForShare(html, TKN, ['/']);
    expect(result).toBe(html);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Idempotency — already-rewritten links
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — idempotency', () => {
  it('does not rewrite an already-rewritten /s/TKN/about link', () => {
    const html = page('<a href="/s/TKN/about">About</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    // /s/TKN/about is not in knownSlugs, so it must be left untouched
    expect(result).toBe(html);
  });

  it('running rewriteLinksForShare twice produces the same result as once', () => {
    const html = page('<a href="/about">About</a>');
    const once = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    const twice = rewriteLinksForShare(once, TKN, KNOWN_SLUGS);
    expect(twice).toBe(once);
  });

  it('idempotent on root slug too', () => {
    const html = page('<a href="/">Home</a>');
    const once = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    const twice = rewriteLinksForShare(once, TKN, KNOWN_SLUGS);
    expect(twice).toBe(once);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — edge cases', () => {
  it('returns input unchanged when there are no anchors', () => {
    const html = page('<p>No links here</p>');
    expect(rewriteLinksForShare(html, TKN, KNOWN_SLUGS)).toBe(html);
  });

  it('returns input unchanged when knownSlugs is empty', () => {
    const html = page('<a href="/about">About</a>');
    expect(rewriteLinksForShare(html, TKN, [])).toBe(html);
  });

  it('returns empty string unchanged', () => {
    expect(rewriteLinksForShare('', TKN, KNOWN_SLUGS)).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Mixed document — multiple matched and unmatched anchors
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — mixed document', () => {
  it('rewrites only matched anchors, leaves unmatched untouched, preserves order', () => {
    const html = page(
      '<a href="/">Home</a>' +
        '<a href="https://external.com">External</a>' +
        '<a href="/about">About</a>' +
        '<a href="#section">Jump</a>' +
        '<a href="/contact">Contact</a>',
    );
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);

    // Matched — rewritten
    expect(result).toContain('href="/s/TKN"');
    expect(result).toContain('href="/s/TKN/about"');
    expect(result).toContain('href="/s/TKN/contact"');

    // Unmatched — unchanged
    expect(result).toContain('href="https://external.com"');
    expect(result).toContain('href="#section"');

    // Original slugs gone from href attributes
    expect(result).not.toMatch(/href="\/about"/);
    expect(result).not.toMatch(/href="\/contact"/);

    // Order preserved: Home before External before About before Jump before Contact
    const homeIdx = result.indexOf('/s/TKN"');
    const externalIdx = result.indexOf('https://external.com');
    const aboutIdx = result.indexOf('/s/TKN/about');
    const jumpIdx = result.indexOf('#section');
    const contactIdx = result.indexOf('/s/TKN/contact');
    expect(homeIdx).toBeLessThan(externalIdx);
    expect(externalIdx).toBeLessThan(aboutIdx);
    expect(aboutIdx).toBeLessThan(jumpIdx);
    expect(jumpIdx).toBeLessThan(contactIdx);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// href attribute position — href anywhere in the tag
// ──────────────────────────────────────────────────────────────────────────────

describe('rewriteLinksForShare — href attribute position', () => {
  it('handles href after other attributes (e.g. class before href)', () => {
    const html = page('<a class="cta" id="btn" href="/about">About</a>');
    const result = rewriteLinksForShare(html, TKN, KNOWN_SLUGS);
    expect(result).toContain('href="/s/TKN/about"');
    expect(result).toContain('target="_top"');
    // Other attributes preserved
    expect(result).toContain('class="cta"');
    expect(result).toContain('id="btn"');
  });
});
