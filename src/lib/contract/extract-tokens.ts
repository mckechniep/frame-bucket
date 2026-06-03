import type { DesignTokens } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// CSS named colors (subset sufficient for design-system tokens; full W3C list
// would be ~150 names — we only need the most common as a fallback heuristic).
// ──────────────────────────────────────────────────────────────────────────────
const CSS_NAMED_COLORS = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'transparent',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
]);

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** True if the trimmed value looks like a CSS color. */
function looksLikeColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  if (/^rgba?\s*\(/.test(v)) return true;
  if (/^hsla?\s*\(/.test(v)) return true;
  if (/^oklch\s*\(/.test(v)) return true;
  if (/^color\s*\(/.test(v)) return true;
  if (CSS_NAMED_COLORS.has(v)) return true;
  return false;
}

/** True if the name signals a type-scale token. */
function isTypeScale(name: string): boolean {
  return /^--fs-|^--text-|^--font-size/.test(name);
}

/** True if the name signals a spacing token. */
function isSpacing(name: string): boolean {
  return /^--space|^--gap|^--gutter/.test(name);
}

/** True if the name signals a font-family custom property. */
function isFontProp(name: string): boolean {
  return /^--font-/.test(name);
}

// ──────────────────────────────────────────────────────────────────────────────
// :root block extraction — brace-counting, not regex-to-first-}
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Finds the first `:root` block inside a `<style>` tag and returns its
 * inner content (the text between the outermost `{` and `}`).  Handles
 * nested `@media` rules that may appear before/after `:root`, or nested
 * braces *inside* `:root` itself, by counting braces rather than matching
 * to the first `}`.
 *
 * Returns `null` when no `:root` block is found.
 */
function extractRootBlock(css: string): string | null {
  // Find `:root` followed (possibly with whitespace) by `{`
  const rootMatch = /(:root\s*)\{/.exec(css);
  if (!rootMatch) return null;

  const openBraceIdx = (rootMatch.index ?? 0) + rootMatch[0].length - 1;
  // openBraceIdx points at the `{` of `:root {`
  let depth = 0;
  let start = -1;
  let end = -1;

  for (let i = openBraceIdx; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      depth++;
      if (depth === 1) start = i + 1; // content starts after opening brace
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (start === -1 || end === -1) return null;
  return css.slice(start, end);
}

// ──────────────────────────────────────────────────────────────────────────────
// Custom property declaration parser
// ──────────────────────────────────────────────────────────────────────────────

interface RawDeclaration {
  name: string;
  value: string;
  note?: string;
}

/**
 * Parses `--name: value; /* note * /` declarations from a CSS block.
 * Values may contain nested parentheses (e.g. `clamp(...)`) and are
 * captured verbatim (trimmed).  A trailing same-line `/* comment * /`
 * is extracted as the note.
 */
function parseDeclarations(block: string): RawDeclaration[] {
  const results: RawDeclaration[] = [];

  // Split into lines and walk them.  A value can span multiple lines
  // (e.g. `background-image: url(...)`) but CSS custom properties in
  // design-system :root blocks are virtually always single-line.
  // We accumulate across lines until we see a `;` that terminates the
  // current declaration.
  const lines = block.split('\n');
  let accumulator = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Skip pure comment lines
    if (line.startsWith('/*') || line === '') {
      accumulator = '';
      continue;
    }

    // Not yet in a declaration — look for `--prop: ...`
    const combined = (accumulator + ' ' + line).trim();

    if (!combined.startsWith('--')) {
      accumulator = '';
      continue;
    }

    // Check if this line ends the declaration (has a `;`)
    // Account for semicolons inside strings or url()s — heuristic: the
    // declaration ends at the first `;` that is not inside parentheses.
    const terminatorIdx = findDeclarationEnd(combined);
    if (terminatorIdx === -1) {
      // Value continues on next line
      accumulator = combined;
      continue;
    }

    // We have a complete declaration.
    // Keep the full line (including any trailing comment after the `;`)
    // for note extraction, but use only the pre-semicolon part for the value.
    const fullLine = combined;
    const declText = combined.slice(0, terminatorIdx);
    accumulator = '';

    const colonIdx = declText.indexOf(':');
    if (colonIdx === -1) continue;

    const name = declText.slice(0, colonIdx).trim();
    if (!name.startsWith('--')) continue;

    // Value is everything between `:` and `;`
    const valueRaw = declText.slice(colonIdx + 1).trim();
    if (!valueRaw) continue;

    // Note: trailing same-line comment anywhere after the `:` (value or after `;`)
    const afterColon = fullLine.slice(fullLine.indexOf(':') + 1);
    const commentMatch = /\/\*([^*]|\*(?!\/))*\*\//.exec(afterColon);
    let note: string | undefined;
    if (commentMatch) {
      note = commentMatch[0]
        .replace(/^\/\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .trim();
    }

    results.push({ name, value: valueRaw, ...(note ? { note } : {}) });
  }

  return results;
}

/** Returns index of the first `;` not inside parentheses, or -1. */
function findDeclarationEnd(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) return i;
  }
  return -1;
}

// ──────────────────────────────────────────────────────────────────────────────
// Google Fonts link parser
// ──────────────────────────────────────────────────────────────────────────────

interface GFontEntry {
  family: string;
  weights: number[];
  href: string;
}

/**
 * Scans `<link>` tags for Google Fonts URLs and extracts family + weights.
 * Handles the CSS2 `family=Name:wght@400;700` format.
 */
function parseGoogleFontsLinks(html: string): GFontEntry[] {
  const results: GFontEntry[] = [];
  const linkRe = /<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["'][^>]*>/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkRe.exec(html)) !== null) {
    const href = linkMatch[1] ?? '';
    // Each `family=` segment can contain one family
    const familyRe = /family=([^&]+)/gi;
    let familyMatch: RegExpExecArray | null;
    while ((familyMatch = familyRe.exec(href)) !== null) {
      const segment = decodeURIComponent(familyMatch[1] ?? '').replace(/\+/g, ' ');
      // Format: "Family Name:wght@400;500;700" or "Family Name"
      const colonIdx = segment.indexOf(':');
      const atIdx = segment.indexOf('@');

      let family: string;
      let weights: number[] = [];

      if (colonIdx !== -1) {
        family = segment.slice(0, colonIdx).trim();
        if (atIdx !== -1) {
          const weightPart = segment.slice(atIdx + 1);
          weights = weightPart
            .split(';')
            .map((w) => {
              // Some entries use "ital,wght@0,400;1,700" — take just the numeric part
              const cleaned = w.replace(/^[^,]*,/, '').trim();
              return parseInt(cleaned, 10);
            })
            .filter((n) => !isNaN(n) && n > 0);
        }
      } else {
        family = segment.trim();
      }

      // Strip display=swap and similar query leftovers
      family = family.split('&')[0]?.trim() ?? family;
      if (!family) continue;

      results.push({ family, weights: weights.length ? weights : [400], href });
    }
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// Font role inference
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Given the set of `--font-*` declarations from :root and a font family name,
 * return the role implied by which variable references that family.
 *
 * Priority: the MOST SPECIFIC role wins.  A font that appears as the first
 * family in `--font-mono` is mono even if it also appears as a fallback in
 * `--font-display`.  Role precedence: mono > display > body > other.
 *
 * "First family" means the font is the first non-generic name in the value,
 * i.e. it's the primary typeface for that role variable.
 */
function inferFontRole(
  family: string,
  fontDecls: Map<string, string>,
): 'display' | 'body' | 'mono' | 'other' {
  const lower = family.toLowerCase();

  // Collect all roles where this family appears (primary = first family only)
  const roles: Array<'display' | 'body' | 'mono'> = [];

  for (const [name, value] of fontDecls) {
    if (!value.toLowerCase().includes(lower)) continue;
    const role = name.includes('mono')
      ? 'mono'
      : name.includes('display')
        ? 'display'
        : name.includes('body')
          ? 'body'
          : null;
    if (!role) continue;
    roles.push(role);
  }

  // Priority order: mono > display > body
  if (roles.includes('mono')) return 'mono';
  if (roles.includes('display')) return 'display';
  if (roles.includes('body')) return 'body';

  // Heuristic: family name itself hints mono
  if (lower.includes('mono') || lower.includes('code') || lower.includes('console')) {
    return 'mono';
  }

  return 'other';
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extracts design tokens from a self-contained HTML page.
 *
 * Rule 7: contract values are EXTRACTED from real HTML, never invented.
 * This function never throws; unparseable input yields empty arrays.
 */
export function extractTokens(
  html: string,
  recipeSummary: string,
  extractedFrom?: string,
): DesignTokens {
  const empty = (): DesignTokens => ({
    colors: [],
    fonts: [],
    typeScale: [],
    spacing: [],
    other: [],
    meta: { extractedFrom: extractedFrom ?? 'inline', recipeSummary, fallback: false },
  });

  try {
    // ── 1. Pull the first <style> block ────────────────────────────────────
    const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html);
    if (!styleMatch) return empty();

    const css = styleMatch[1] ?? '';

    // ── 2. Find :root block (brace-counting) ───────────────────────────────
    const rootBlock = extractRootBlock(css);

    // ── 3. Parse Google Fonts links ────────────────────────────────────────
    const gFonts = parseGoogleFontsLinks(html);

    // ── 4. Build font-role map from :root --font-* declarations ───────────
    const fontDecls = new Map<string, string>();

    if (rootBlock) {
      const decls = parseDeclarations(rootBlock);
      for (const d of decls) {
        if (isFontProp(d.name)) {
          fontDecls.set(d.name, d.value);
        }
      }
    }

    // ── 5. Classify :root declarations ────────────────────────────────────
    const colors: DesignTokens['colors'] = [];
    const typeScale: DesignTokens['typeScale'] = [];
    const spacing: DesignTokens['spacing'] = [];
    const other: DesignTokens['other'] = [];

    if (rootBlock) {
      const decls = parseDeclarations(rootBlock);

      for (const d of decls) {
        // Type scale — check by name first (reliable naming convention)
        if (isTypeScale(d.name)) {
          typeScale.push({ name: d.name, value: d.value });
          continue;
        }

        // Spacing
        if (isSpacing(d.name)) {
          spacing.push({ name: d.name, value: d.value });
          continue;
        }

        // Color — classify by value (most reliable per design notes)
        if (looksLikeColor(d.value)) {
          colors.push({ name: d.name, value: d.value, ...(d.note ? { note: d.note } : {}) });
          continue;
        }

        // Remainder → other
        other.push({ name: d.name, value: d.value });
      }
    }

    // ── 6. Build fonts array ───────────────────────────────────────────────
    // Deduplicate: Google Fonts entries take precedence (they carry weights).
    // Fall back to families found in --font-* declarations not in GFont links.
    const seenFamilies = new Set<string>();
    const fonts: DesignTokens['fonts'] = [];

    for (const gf of gFonts) {
      if (seenFamilies.has(gf.family)) continue;
      seenFamilies.add(gf.family);
      fonts.push({
        family: gf.family,
        weights: gf.weights,
        role: inferFontRole(gf.family, fontDecls),
        source: gf.href,
      });
    }

    // Families referenced in --font-* that weren't in Google Fonts links
    for (const [, value] of fontDecls) {
      // Extract quoted or unquoted font family names from the value
      const familyNames = extractFamilyNames(value);
      for (const family of familyNames) {
        if (seenFamilies.has(family)) continue;
        // Skip generic families
        if (isGenericFamily(family)) continue;
        seenFamilies.add(family);
        fonts.push({
          family,
          weights: [400],
          role: inferFontRole(family, fontDecls),
        });
      }
    }

    return {
      colors,
      fonts,
      typeScale,
      spacing,
      other,
      meta: { extractedFrom: extractedFrom ?? 'inline', recipeSummary, fallback: false },
    };
  } catch {
    return empty();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

function isGenericFamily(name: string): boolean {
  return GENERIC_FAMILIES.has(name.toLowerCase());
}

/** Extracts font family names from a CSS font-family value string. */
function extractFamilyNames(value: string): string[] {
  const names: string[] = [];
  // Split on commas, strip quotes and whitespace
  const parts = value.split(',');
  for (const part of parts) {
    const name = part
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .trim();
    if (name) names.push(name);
  }
  return names;
}
