import { generateImage, type ImageSize } from '@/lib/openrouter/image';

/**
 * Scans HTML for `<img src="OPENROUTER:<prompt>" width=... height=...>`
 * placeholders, generates real images via OpenRouter for each, and replaces
 * the src attribute with the returned base64 data URL.
 *
 * - Generation runs in parallel via Promise.all.
 * - Width/height attributes are required; aspect ratio is selected from the
 *   closest supported value.
 * - If a placeholder has no width/height, defaults to 1024x1024.
 * - Throws if any single image generation fails (caller decides UX).
 */

const IMG_TAG = /<img\b([^>]*)>/gi;
const SRC_PLACEHOLDER = /\bsrc="OPENROUTER:([^"]+)"/i;
const WIDTH_ATTR = /\bwidth="(\d+)"/i;
const HEIGHT_ATTR = /\bheight="(\d+)"/i;

interface InjectImagesOpts {
  size?: ImageSize;
}

async function asyncReplace(
  str: string,
  regex: RegExp,
  replacer: (m: RegExpMatchArray) => Promise<string>,
): Promise<string> {
  const matches = [...str.matchAll(regex)];
  if (matches.length === 0) return str;
  const replacements = await Promise.all(matches.map(replacer));
  let result = '';
  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const idx = m.index ?? 0;
    result += str.slice(cursor, idx);
    result += replacements[i];
    cursor = idx + m[0].length;
  }
  result += str.slice(cursor);
  return result;
}

export async function injectImages(html: string, opts: InjectImagesOpts = {}): Promise<string> {
  return asyncReplace(html, IMG_TAG, async (m) => {
    const original = m[0];
    const attrs = m[1] ?? '';
    const srcMatch = SRC_PLACEHOLDER.exec(attrs);
    if (!srcMatch) return original;

    const widthMatch = WIDTH_ATTR.exec(attrs);
    const heightMatch = HEIGHT_ATTR.exec(attrs);
    const prompt = srcMatch[1]!;
    const width = widthMatch ? Number(widthMatch[1]) : 1024;
    const height = heightMatch ? Number(heightMatch[1]) : 1024;

    const dataUrl = await generateImage({ prompt, width, height, size: opts.size });
    return original.replace(SRC_PLACEHOLDER, `src="${dataUrl}"`);
  });
}

export function countImagePlaceholders(html: string): number {
  let count = 0;
  for (const m of html.matchAll(IMG_TAG)) {
    if (SRC_PLACEHOLDER.test(m[1] ?? '')) count++;
  }
  return count;
}
