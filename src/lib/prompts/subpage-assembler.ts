import type { AnthropicRequest, SystemBlock } from './assembler';
import { loadInvariantLayers, formatInvariantBlock } from './canon-layers';
import { NAV_START, NAV_END } from '@/lib/sites/nav-injector';
import type { NavPage } from '@/lib/sites/nav-injector';

export interface SubpageRequest {
  contractMd: string; // from deriveContract — the design contract markdown
  pageBrief: string; // user's free-form description of the page to build
  pageTitle: string;
  pageSlug: string;
  navManifest: NavPage[]; // ALL pages incl. the one being created
  landingStructure: string; // raw HTML from the stored artifact; summarized by outlineHtml() internally
}

const SUBPAGE_DIRECTIVE = `Output ONLY the file. No commentary, no markdown fences, no explanations.
Include a site navigation element appropriate to the design (it may be visually minimal). Wrap ONLY the navigation link anchors — not the surrounding <nav> or container — in these exact HTML comment markers:
${NAV_START}
<a href="...">...</a>
${NAV_END}
Render ONE link per page listed in the site manifest above, including a self-link for the page you are generating. Do not omit these markers.`;

export async function assembleSubpageRequest(req: SubpageRequest): Promise<AnthropicRequest> {
  const layers = await loadInvariantLayers();

  const invariantText = formatInvariantBlock(layers);

  const system: SystemBlock[] = [
    {
      type: 'text',
      text: 'You are a senior frontend designer adding a new page to an EXISTING website. Match the established design system exactly — do not invent a new aesthetic.',
    },
    {
      type: 'text',
      text: invariantText,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `## Design Contract (follow exactly)\n\n${req.contractMd}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  const sortedPages = [...req.navManifest].sort((a, b) => a.position - b.position);
  const navList = sortedPages.map((p) => `- ${p.title} (${p.slug})`).join('\n');

  const structureSummary = outlineHtml(req.landingStructure);

  const userContent = [
    `You are generating the page: "${req.pageTitle}" at ${req.pageSlug}.`,
    '',
    `## Page Brief`,
    req.pageBrief,
    '',
    `## Site Navigation Manifest`,
    `This site's pages:`,
    navList,
    `You are generating: ${req.pageTitle} (${req.pageSlug}).`,
    '',
    `## Landing Page Structure`,
    structureSummary,
    '',
    `---`,
    '',
    SUBPAGE_DIRECTIVE,
  ].join('\n');

  return {
    model: 'claude-opus-4-7',
    max_tokens: 32000,
    system,
    messages: [{ role: 'user', content: userContent }],
    stream: true,
  };
}

/**
 * Surrogate-safe truncation: cuts `s` to at most `max` characters without
 * splitting a UTF-16 surrogate pair (which would produce lone surrogates and
 * ill-formed JSON on the API wire). Appends '…' when truncation occurs.
 */
function safeTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  let i = max - 1;
  // don't cut inside a surrogate pair (low surrogate = 0xDC00–0xDFFF)
  while (i > 0 && (s.charCodeAt(i) & 0xfc00) === 0xdc00) i--;
  return s.slice(0, i) + '…';
}

/**
 * Extracts a compact structural summary of an HTML page — h1–h3 text in
 * document order plus a count of <section> elements. Pure string/regex ops,
 * never throws. Caps output at 500 chars (surrogate-safe).
 *
 * @example
 * outlineHtml('<h1>Foo</h1><h2>Bar</h2><section></section>')
 * // "H1: Foo\nH2: Bar\n(1 section)"
 */
export function outlineHtml(html: string): string {
  try {
    if (!html || typeof html !== 'string') {
      return '(no headings found)\n(0 sections)';
    }

    // Count <section> elements
    const sectionCount = (html.match(/<section[\s>]/gi) ?? []).length;

    // Extract headings h1–h3 in document order
    const headingRe = /<(h[123])[^>]*>([\s\S]*?)<\/h[123]>/gi;
    const headings: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = headingRe.exec(html)) !== null) {
      const level = match[1]?.toUpperCase() ?? '';
      // Strip any inner HTML tags from heading text
      const rawText = match[2] ?? '';
      const text = rawText
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (level && text) {
        headings.push(`${level}: ${text}`);
      }
    }

    const headingLines = headings.length > 0 ? headings.join('\n') : '(no headings found)';
    const full = `${headingLines}\n(${sectionCount} section${sectionCount === 1 ? '' : 's'})`;

    return safeTruncate(full, 500);
  } catch {
    return '(no headings found)\n(0 sections)';
  }
}
