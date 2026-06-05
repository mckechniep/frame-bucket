import { describe, it, expect } from 'vitest';
import { NAV_START, NAV_END, hasNavMarkers, injectNav, type NavPage } from '../nav-injector';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const PAGES: NavPage[] = [
  { slug: '/', title: 'Home', position: 1 },
  { slug: '/about', title: 'About', position: 2 },
  { slug: '/contact', title: 'Contact', position: 3 },
];

/** Minimal HTML with a single styled anchor between nav markers. */
function makeHtml(navContent: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<nav>
${NAV_START}
${navContent}
${NAV_END}
</nav>
</body>
</html>`;
}

const STYLED_TEMPLATE_HTML = makeHtml(`  <a class="nav-link" href="/">Home</a>`);

// ──────────────────────────────────────────────────────────────────────────────
// hasNavMarkers
// ──────────────────────────────────────────────────────────────────────────────

describe('hasNavMarkers', () => {
  it('returns true for a well-formed marker pair', () => {
    expect(hasNavMarkers(makeHtml('<a href="/">Home</a>'))).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(hasNavMarkers('')).toBe(false);
  });

  it('returns false when start marker is missing', () => {
    const html = `<html><body>${NAV_END}</body></html>`;
    expect(hasNavMarkers(html)).toBe(false);
  });

  it('returns false when end marker is missing', () => {
    const html = `<html><body>${NAV_START}</body></html>`;
    expect(hasNavMarkers(html)).toBe(false);
  });

  it('returns false when end precedes start', () => {
    const html = `<html><body>${NAV_END}${NAV_START}</body></html>`;
    expect(hasNavMarkers(html)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — core behaviour
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — template classes preserved', () => {
  it('produces one <a> per page (3 pages → 3 anchors)', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/');
    const matches = result.match(/<a /g);
    expect(matches).toHaveLength(3);
  });

  it('preserves class="nav-link" from the template on every produced anchor', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/');
    const anchorRe = /<a\b[^>]*>/g;
    const tags = result.match(anchorRe) ?? [];
    expect(tags).toHaveLength(3);
    for (const tag of tags) {
      expect(tag).toContain('class="nav-link"');
    }
  });

  it('sets href to page slug', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/');
    expect(result).toContain('href="/"');
    expect(result).toContain('href="/about"');
    expect(result).toContain('href="/contact"');
  });

  it('sets inner text to page title', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/');
    expect(result).toContain('>Home<');
    expect(result).toContain('>About<');
    expect(result).toContain('>Contact<');
  });

  it('outputs pages in position order even when input is unsorted', () => {
    const shuffled: NavPage[] = [
      { slug: '/contact', title: 'Contact', position: 3 },
      { slug: '/', title: 'Home', position: 1 },
      { slug: '/about', title: 'About', position: 2 },
    ];
    const result = injectNav(STYLED_TEMPLATE_HTML, shuffled, '/');
    const homeIdx = result.indexOf('>Home<');
    const aboutIdx = result.indexOf('>About<');
    const contactIdx = result.indexOf('>Contact<');
    expect(homeIdx).toBeLessThan(aboutIdx);
    expect(aboutIdx).toBeLessThan(contactIdx);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — aria-current
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — aria-current', () => {
  it('adds aria-current="page" to the current page anchor', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/about');
    // Find anchor for /about
    const aboutRe = /<a\b[^>]*href="\/about"[^>]*>/;
    const aboutTag = aboutRe.exec(result)?.[0] ?? '';
    expect(aboutTag).toContain('aria-current="page"');
  });

  it('does NOT add aria-current to non-current page anchors', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/about');
    const homeRe = /<a\b[^>]*href="\/"[^>]*>/;
    const homeTag = homeRe.exec(result)?.[0] ?? '';
    expect(homeTag).not.toContain('aria-current');
  });

  it('does not duplicate aria-current if template already had it', () => {
    // Template already carries aria-current="page"
    const html = makeHtml(`  <a class="nav-link" href="/" aria-current="page">Home</a>`);
    const result = injectNav(html, PAGES, '/');
    const homeRe = /<a\b[^>]*href="\/"[^>]*>/;
    const homeTag = homeRe.exec(result)?.[0] ?? '';
    const count = (homeTag.match(/aria-current/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — opts.hrefFor
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — opts.hrefFor', () => {
  it('uses hrefFor mapping for hrefs', () => {
    const hrefFor = (s: string) => (s === '/' ? '/s/TKN' : '/s/TKN' + s);
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/', { hrefFor });
    expect(result).toContain('href="/s/TKN"');
    expect(result).toContain('href="/s/TKN/about"');
    expect(result).toContain('href="/s/TKN/contact"');
    // Original slugs should NOT appear as hrefs
    expect(result).not.toMatch(/href="\/about"/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — opts.targetTop
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — opts.targetTop', () => {
  it('adds target="_top" to every anchor when targetTop is true', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/', { targetTop: true });
    const anchorRe = /<a\b[^>]*>/g;
    const tags = result.match(anchorRe) ?? [];
    expect(tags).toHaveLength(3);
    for (const tag of tags) {
      expect(tag).toContain('target="_top"');
    }
  });

  it('does not duplicate target="_top" if template already had it', () => {
    const html = makeHtml(`  <a class="nav-link" href="/" target="_top">Home</a>`);
    const result = injectNav(html, PAGES, '/', { targetTop: true });
    const anchorRe = /<a\b[^>]*>/g;
    const tags = result.match(anchorRe) ?? [];
    for (const tag of tags) {
      const count = (tag.match(/target=/g) ?? []).length;
      expect(count).toBe(1);
    }
  });

  it('does NOT add target="_top" when targetTop is false or omitted', () => {
    const result = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/');
    expect(result).not.toContain('target="_top"');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — no markers → unchanged
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — malformed / absent markers', () => {
  it('returns html unchanged (identity) when no markers present', () => {
    const html = '<html><body><nav><a href="/">Home</a></nav></body></html>';
    expect(injectNav(html, PAGES, '/')).toBe(html);
  });

  it('returns html unchanged when only start marker present', () => {
    const html = `<html><body>${NAV_START}</body></html>`;
    expect(injectNav(html, PAGES, '/')).toBe(html);
  });

  it('returns html unchanged when only end marker present', () => {
    const html = `<html><body>${NAV_END}</body></html>`;
    expect(injectNav(html, PAGES, '/')).toBe(html);
  });

  it('returns html unchanged when end precedes start', () => {
    const html = `<html><body>${NAV_END} something ${NAV_START}</body></html>`;
    expect(injectNav(html, PAGES, '/')).toBe(html);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — degenerate template (no <a> between markers)
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — degenerate template', () => {
  it('uses fallback template when no <a> exists between markers', () => {
    const html = `<!DOCTYPE html><html><body><nav>${NAV_START}<!-- empty -->${NAV_END}</nav></body></html>`;
    const result = injectNav(html, PAGES, '/');
    expect(result).toContain('>Home<');
    expect(result).toContain('>About<');
    expect(result).toContain('>Contact<');
    expect(result).toContain('href="/"');
    expect(result).toContain('href="/about"');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — idempotency
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — idempotency', () => {
  it('running twice equals running once', () => {
    const once = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/');
    const twice = injectNav(once, PAGES, '/');
    expect(twice).toBe(once);
  });

  it('idempotent with aria-current', () => {
    const once = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/about');
    const twice = injectNav(once, PAGES, '/about');
    expect(twice).toBe(once);
  });

  it('idempotent with aria-current + targetTop (Task 20 combination)', () => {
    // /about is NOT the first page by position — exercises the managed-attr
    // ordering bug path where run 1 could emit aria-current before target
    // and run 2 could reverse them.
    const once = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/about', { targetTop: true });
    const twice = injectNav(once, PAGES, '/about', { targetTop: true });
    expect(twice).toBe(once);
  });

  it('hrefFor + targetTop compose correctly and stay idempotent', () => {
    const hrefFor = (s: string) => `/share/TOKEN${s}`;
    const opts = { hrefFor, targetTop: true };
    const once = injectNav(STYLED_TEMPLATE_HTML, PAGES, '/about', opts);
    // Both opts applied: mapped href and target="_top"
    expect(once).toContain('href="/share/TOKEN/about"');
    expect(once).toContain('target="_top"');
    const twice = injectNav(once, PAGES, '/about', opts);
    expect(twice).toBe(once);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — HTML escaping
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — HTML-escaped titles', () => {
  it('escapes & in title to &amp;', () => {
    const pages: NavPage[] = [{ slug: '/', title: 'Tom & Jerry', position: 1 }];
    const result = injectNav(STYLED_TEMPLATE_HTML, pages, '/');
    expect(result).toContain('>Tom &amp; Jerry<');
    expect(result).not.toContain('>Tom & Jerry<');
  });

  it('escapes < and > in title', () => {
    const pages: NavPage[] = [{ slug: '/', title: 'A<B>C', position: 1 }];
    const result = injectNav(STYLED_TEMPLATE_HTML, pages, '/');
    expect(result).toContain('>A&lt;B&gt;C<');
  });

  it('escapes " in title', () => {
    const pages: NavPage[] = [{ slug: '/', title: 'Say "Hello"', position: 1 }];
    const result = injectNav(STYLED_TEMPLATE_HTML, pages, '/');
    expect(result).toContain('>Say &quot;Hello&quot;<');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — href escaping
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — href escaping', () => {
  it('escapes double-quote in slug to prevent attribute breakout', () => {
    const maliciousPages: NavPage[] = [
      { slug: '/x" onmouseover="evil', title: 'Evil', position: 1 },
    ];
    const result = injectNav(STYLED_TEMPLATE_HTML, maliciousPages, '/');
    // The raw breakout sequence must NOT appear
    expect(result).not.toContain('" onmouseover=');
    // The escaped form must be present
    expect(result).toContain('&quot;');
  });

  it('escapes double-quote returned by hrefFor to prevent attribute breakout', () => {
    const pages: NavPage[] = [{ slug: '/', title: 'Home', position: 1 }];
    const hrefFor = () => '/path?x=1"&y=2';
    const result = injectNav(STYLED_TEMPLATE_HTML, pages, '/', { hrefFor });
    expect(result).not.toContain('href="/path?x=1"');
    expect(result).toContain('&quot;');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — removeAttr handles unquoted attribute forms
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — removeAttr unquoted / boolean forms', () => {
  it('strips unquoted aria-current from a non-current page anchor', () => {
    // Template carries aria-current=page (no quotes) on the Home anchor.
    // Injecting with currentSlug='/about' should leave Home with NO aria-current.
    const html = makeHtml(`<a href="/" aria-current=page>Home</a>`);
    const result = injectNav(html, PAGES, '/about');
    const homeRe = /<a\b[^>]*href="\/"[^>]*>/;
    const homeTag = homeRe.exec(result)?.[0] ?? '';
    expect(homeTag).not.toContain('aria-current');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — whitespace/indentation separator
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — whitespace separator', () => {
  it('preserves multi-line indented separator between links', () => {
    const indented = `
  <a class="nav-link" href="/">Home</a>
  <a class="nav-link" href="/about">About</a>`;
    const html = makeHtml(indented);
    const twoPages: NavPage[] = [
      { slug: '/', title: 'Home', position: 1 },
      { slug: '/about', title: 'About', position: 2 },
    ];
    const result = injectNav(html, twoPages, '/');
    // The separator (newline + two spaces) between links should be preserved
    expect(result).toContain('</a>\n  <a');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// injectNav — only processes FIRST marker pair
// ──────────────────────────────────────────────────────────────────────────────

describe('injectNav — only processes first marker pair', () => {
  it('leaves a second marker pair untouched', () => {
    const twoBlocks = `<!DOCTYPE html><html><body>
<nav id="main">${NAV_START}<a href="/">Home</a>${NAV_END}</nav>
<footer>${NAV_START}<a href="/">Home</a>${NAV_END}</footer>
</body></html>`;
    const result = injectNav(twoBlocks, PAGES, '/');
    // First block should have 3 links
    const firstBlock = result.slice(
      result.indexOf(NAV_START),
      result.indexOf(NAV_END) + NAV_END.length,
    );
    expect((firstBlock.match(/<a /g) ?? []).length).toBe(3);
    // The second occurrence of the marker pair should still have exactly 1 link
    const secondStart = result.indexOf(NAV_START, result.indexOf(NAV_END) + 1);
    const secondEnd = result.indexOf(NAV_END, secondStart + 1);
    const secondBlock = result.slice(secondStart, secondEnd + NAV_END.length);
    expect((secondBlock.match(/<a /g) ?? []).length).toBe(1);
  });
});
