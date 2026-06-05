// ──────────────────────────────────────────────────────────────────────────────
// Link Rewriter — Share URL rewriting for in-content anchors
//
// Companion to nav-injector.ts (Task 9). The share viewer calls injectNav
// FIRST (which rewrites nav-region links via hrefFor + targetTop), then calls
// rewriteLinksForShare to catch any in-content internal links (e.g. CTA
// buttons, body-copy links) that live outside the nav markers.
//
// Pure; never throws. Idempotent — running twice equals running once because
// already-rewritten share URLs (/s/<token>/...) never exactly match a known
// slug (/about), so they are skipped on the second pass.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Rewrites internal hrefs (matching a known site slug) to their /s/<token>/<slug>
 * share URL, adding target="_top" so the link escapes the sandboxed iframe on click.
 *
 * External links, anchors (#...), mailto:, tel:, and unknown paths are left
 * untouched. Pure; never throws.
 */
export function rewriteLinksForShare(html: string, token: string, knownSlugs: string[]): string {
  if (!html || knownSlugs.length === 0) return html;

  // ── 1. Build slug → share-URL map ─────────────────────────────────────────
  const slugToShare = new Map<string, string>();
  for (const slug of knownSlugs) {
    // "/" maps to "/s/<token>"; "/about" maps to "/s/<token>/about"
    const shareUrl = slug === '/' ? `/s/${token}` : `/s/${token}${slug}`;
    slugToShare.set(slug, shareUrl);
  }

  // ── 2. Walk all <a ...> opening tags and rewrite matching hrefs ───────────
  // Strategy: scan for each <a (case-insensitive, followed by a space or >),
  // walk forward respecting quoted attribute values to find the closing >,
  // then inspect / rewrite within that open tag only. This mirrors the
  // anchor-scanning approach in nav-injector.ts without requiring a DOM parser.
  // Note: Like nav-injector, the walker does not skip <script>/<style>/comment
  // blocks — acceptable for app-generated content (user HTML is never passed here).

  let result = '';
  let cursor = 0;

  // Regex to find the START of each opening anchor tag (<a followed by
  // whitespace or > — ensures we don't accidentally match <abbr, <aside, etc.)
  const aStartRe = /<a[\s>]/gi;
  let match: RegExpExecArray | null;

  while ((match = aStartRe.exec(html)) !== null) {
    const tagStart = match.index;

    // Append everything from cursor up to (but not including) this tag.
    result += html.slice(cursor, tagStart);

    // Walk forward from '<a' to find the end of the opening tag, respecting
    // quoted attribute values (a '>' inside a quoted value must not terminate
    // the scan early).
    let i = tagStart + 2; // skip past '<a'
    let inQuote: '"' | "'" | null = null;

    while (i < html.length) {
      const ch = html[i];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === '>') {
        break;
      }
      i++;
    }

    if (i >= html.length) {
      // Malformed tag — no closing '>'. Emit as-is and stop scanning.
      result += html.slice(tagStart);
      cursor = html.length;
      break;
    }

    const tagEnd = i + 1; // index after the '>'
    const openTag = html.slice(tagStart, tagEnd);

    // ── 3. Extract the href value from the open tag ───────────────────────
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(openTag);
    const hrefValue = hrefMatch?.[1] ?? hrefMatch?.[2] ?? null;

    if (hrefValue !== null && slugToShare.has(hrefValue)) {
      // ── 4. Rewrite href and ensure target="_top" ────────────────────────
      const shareUrl = slugToShare.get(hrefValue)!;
      let rewritten = setHrefAttr(openTag, shareUrl);
      rewritten = ensureTargetTop(rewritten);
      result += rewritten;
    } else {
      // Href doesn't match any known slug — emit verbatim.
      result += openTag;
    }

    cursor = tagEnd;
    // Advance the regex cursor so it continues after the tag we just consumed.
    aStartRe.lastIndex = tagEnd;
  }

  // Append the remainder of the document.
  result += html.slice(cursor);
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Replaces the value of the `href` attribute in an opening tag with the given
 * URL. The URL is escaped (`"` → `&quot;`) for defense-in-depth consistency
 * with nav-injector.ts, even though share URLs are app-controlled.
 *
 * If no href attribute is present the URL is inserted before the closing '>'.
 */
function setHrefAttr(openTag: string, url: string): string {
  const safeUrl = url.replace(/"/g, '&quot;');
  const hrefRe = /\bhref\s*=\s*(?:"[^"]*"|'[^']*')/i;
  if (hrefRe.test(openTag)) {
    return openTag.replace(hrefRe, `href="${safeUrl}"`);
  }
  return openTag.replace(/>$/, ` href="${safeUrl}">`);
}

/**
 * Ensures the opening tag carries exactly one `target="_top"` attribute.
 * If the tag already has any `target=...` attribute it is replaced with
 * `target="_top"` (canonicalising _blank → _top for share-viewer navigation).
 * If no target attribute is present, `target="_top"` is appended before '>'.
 */
function ensureTargetTop(openTag: string): string {
  const targetRe = /\s*\btarget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/i;
  if (targetRe.test(openTag)) {
    return openTag.replace(targetRe, ' target="_top"');
  }
  return openTag.replace(/>$/, ' target="_top">');
}
