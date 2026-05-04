import { env } from '@/env';

/**
 * Generate an image via OpenRouter using google/gemini-2.5-flash-image.
 *
 * Returns a base64 data URL (e.g. `data:image/png;base64,...`) suitable to
 * drop directly into an `<img src="...">` attribute.
 *
 * Aspect ratio is auto-selected from the closest supported value to
 * `width/height`. Image size defaults to `2K` for cost/quality balance.
 */
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash-image';

export type ImageSize = '0.5K' | '1K' | '2K' | '4K';

// Supported aspect ratios per OpenRouter docs, paired with their decimal
// equivalents for nearest-match selection.
const ASPECT_RATIOS: Array<readonly [string, number]> = [
  ['1:1', 1],
  ['21:9', 21 / 9],
  ['16:9', 16 / 9],
  ['5:4', 5 / 4],
  ['4:3', 4 / 3],
  ['3:2', 3 / 2],
  ['2:3', 2 / 3],
  ['3:4', 3 / 4],
  ['4:5', 4 / 5],
  ['9:16', 9 / 16],
];

export function selectAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  let bestLabel = '1:1';
  let bestDiff = Infinity;
  for (const [label, value] of ASPECT_RATIOS) {
    const diff = Math.abs(ratio - value);
    if (diff < bestDiff) {
      bestLabel = label;
      bestDiff = diff;
    }
  }
  return bestLabel;
}

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string;
      images?: Array<{
        type?: 'image_url';
        image_url?: { url?: string };
      }>;
    };
  }>;
}

export interface GenerateImageOpts {
  prompt: string;
  width: number;
  height: number;
  size?: ImageSize;
}

export async function generateImage(opts: GenerateImageOpts): Promise<string> {
  const aspect_ratio = selectAspectRatio(opts.width, opts.height);
  const image_size: ImageSize = opts.size ?? '2K';

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: opts.prompt }],
      modalities: ['image', 'text'],
      image_config: { aspect_ratio, image_size },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new Error(`OpenRouter image gen failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as OpenRouterImageResponse;
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) {
    throw new Error('OpenRouter returned no image in response');
  }
  return url;
}
