// ──────────────────────────────────────────────────────────────────────────────
// Nav Injector — Rule 6
//
// Owns the `fb:nav-links` marker contract and deterministically injects the
// current page set into generated HTML at serve time.
//
// Rule 6: stored artifacts are NEVER mutated; nav is injected only when
// serving/exporting. This module is pure (no IO, never throws).
// ──────────────────────────────────────────────────────────────────────────────

export const NAV_START = '<!-- fb:nav-links:start -->';
export const NAV_END = '<!-- fb:nav-links:end -->';

export interface NavPage {
  slug: string; // e.g. "/", "/about"
  title: string; // e.g. "Home", "About"
  position: number;
}

export interface InjectNavOpts {
  /** Map a page slug to the href used in the rendered anchor. */
  hrefFor?: (slug: string) => string;
  /** When true, add target="_top" to every produced anchor. */
  targetTop?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/** True if the HTML contains a well-formed nav marker pair (start before end). */
export function hasNavMarkers(html: string): boolean {
  const startIdx = html.indexOf(NAV_START);
  if (startIdx === -1) return false;
  const endIdx = html.indexOf(NAV_END, startIdx + NAV_START.length);
  return endIdx !== -1;
}

/**
 * Replaces the content between the FIRST nav marker pair with one <a> per page.
 * Returns html unchanged (no throw) if markers are absent or malformed.
 */
export function injectNav(
  html: string,
  pages: NavPage[],
  currentSlug: string,
  opts?: InjectNavOpts,
): string {
  // ── 1. Find the FIRST well-formed marker pair ─────────────────────────────
  const startIdx = html.indexOf(NAV_START);
  if (startIdx === -1) return html;

  const contentStart = startIdx + NAV_START.length;
  const endIdx = html.indexOf(NAV_END, contentStart);
  if (endIdx === -1) return html;
  // END-before-START case is implicitly handled: indexOf(NAV_END, contentStart)
  // starts searching after startIdx, so it can never find an END that precedes START.

  const innerContent = html.slice(contentStart, endIdx);

  // ── 2. Extract link template from existing content ────────────────────────
  // Match the first <a ...>...</a> (non-greedy inner content, which may contain
  // nested tags like <span>). Strategy: find <a, scan for the first > after any
  // attributes, then find the matching </a>.
  const templateResult = extractFirstAnchor(innerContent);
  const { openTag } = templateResult ?? { openTag: '<a href="%HREF%">' };

  // ── 3. Detect whitespace separator between links ──────────────────────────
  const separator = detectSeparator(innerContent);

  // ── 4. Build new links ────────────────────────────────────────────────────
  const sorted = [...pages].sort((a, b) => a.position - b.position);
  const links = sorted.map((page) => {
    const href = opts?.hrefFor ? opts.hrefFor(page.slug) : page.slug;
    const title = escapeHtml(page.title);
    const isCurrent = page.slug === currentSlug;
    return buildAnchor(openTag, href, title, isCurrent, opts?.targetTop ?? false);
  });

  // ── 5. Replace content between the markers (keep markers themselves) ──────
  const before = html.slice(0, contentStart);
  const after = html.slice(endIdx);
  return before + links.join(separator) + after;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Escape HTML special characters in a plain-text title. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface AnchorParts {
  /** The full opening tag, e.g. `<a class="nav-link" href="/">` */
  openTag: string;
  /** The inner content between the opening and closing tag. */
  innerText: string;
}

/**
 * Extracts the first `<a ...>...</a>` from a string.
 * Returns null if no anchor is found.
 *
 * Strategy: find `<a` then scan for the closing `>` of the opening tag
 * (respecting quoted attribute values so a `>` inside a quote doesn't
 * terminate early). Then find `</a>` after that.
 */
function extractFirstAnchor(content: string): AnchorParts | null {
  // Find the opening <a (case-insensitive, followed by a space or >)
  const aStartRe = /<a[\s>]/i;
  const aMatch = aStartRe.exec(content);
  if (!aMatch) return null;

  const aStart = aMatch.index;

  // Walk forward from <a to find the end of the opening tag, respecting quotes.
  let i = aStart + 2; // skip past '<a'
  let inQuote: '"' | "'" | null = null;

  while (i < content.length) {
    const ch = content[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === '>') {
      break;
    }
    i++;
  }

  if (i >= content.length) return null; // malformed — no closing >

  const openTagEnd = i + 1; // index after the >
  const openTag = content.slice(aStart, openTagEnd);

  // Find </a> after the opening tag (case-insensitive)
  const closeTagRe = /<\/a>/i;
  const closeMatch = closeTagRe.exec(content.slice(openTagEnd));
  if (!closeMatch) return null;

  const innerText = content.slice(openTagEnd, openTagEnd + closeMatch.index);
  return { openTag, innerText };
}

/**
 * Detects the whitespace separator between the first and second <a> in the
 * existing nav content. Falls back to '\n' if there's only one anchor.
 */
function detectSeparator(content: string): string {
  // Find the end of the first </a> then collect whitespace until the next <a
  const closeRe = /<\/a>/i;
  const firstClose = closeRe.exec(content);
  if (!firstClose) return '\n';

  const afterFirstClose = firstClose.index + firstClose[0].length;
  const remainder = content.slice(afterFirstClose);

  // Collect leading whitespace before the next <a
  const sepMatch = /^(\s+)(?=<a[\s>])/i.exec(remainder);
  return sepMatch?.[1] ?? '\n';
}

/**
 * Clones the template open tag and produces a fully-formed anchor string
 * for the given page.
 */
function buildAnchor(
  openTag: string,
  href: string,
  escapedTitle: string,
  isCurrent: boolean,
  targetTop: boolean,
): string {
  let tag = setHrefAttr(openTag, href);

  if (isCurrent) {
    tag = ensureAttr(tag, 'aria-current', 'page');
  } else {
    // Remove any leftover aria-current from the template on non-current pages
    tag = removeAttr(tag, 'aria-current');
  }

  if (targetTop) {
    tag = ensureAttr(tag, 'target', '_top');
  }

  return `${tag}${escapedTitle}</a>`;
}

/**
 * Replaces the value of the `href` attribute in an opening tag.
 * If no href attribute exists, inserts one before the closing `>`.
 */
function setHrefAttr(openTag: string, href: string): string {
  // Match href="..." or href='...' (possibly with spaces around =)
  const hrefRe = /\bhref\s*=\s*(?:"[^"]*"|'[^']*')/i;
  if (hrefRe.test(openTag)) {
    return openTag.replace(hrefRe, `href="${href}"`);
  }
  // No href — insert before the closing >
  return openTag.replace(/>$/, ` href="${href}">`);
}

/**
 * Ensures an attribute with the given name and value is present in the tag,
 * adding it before `>` if absent, or leaving it untouched if already present
 * with any value. Normalizes to the given value only when absent.
 */
function ensureAttr(openTag: string, name: string, value: string): string {
  const attrRe = new RegExp(`\\b${name}\\s*=`, 'i');
  if (attrRe.test(openTag)) return openTag; // already present — don't touch
  return openTag.replace(/>$/, ` ${name}="${value}">`);
}

/**
 * Removes an attribute (name="value" or name='value') from an opening tag.
 * Used to strip `aria-current` from the template when building non-current links.
 */
function removeAttr(openTag: string, name: string): string {
  const attrRe = new RegExp(`\\s*\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'gi');
  return openTag.replace(attrRe, '');
}
