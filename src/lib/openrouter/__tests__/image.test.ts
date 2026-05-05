import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @/env to bypass module-load validation in tests.
vi.mock('@/env', () => ({ env: { OPENROUTER_API_KEY: 'sk-or-test-fake' } }));

import { selectAspectRatio, generateImage } from '../image';

describe('selectAspectRatio', () => {
  it('picks 1:1 for square', () => {
    expect(selectAspectRatio(1024, 1024)).toBe('1:1');
  });

  it('picks 16:9 for 1600x900', () => {
    expect(selectAspectRatio(1600, 900)).toBe('16:9');
  });

  it('picks 3:4 for 900x1200 (portrait)', () => {
    expect(selectAspectRatio(900, 1200)).toBe('3:4');
  });

  it('picks 4:3 for 1600x1200', () => {
    expect(selectAspectRatio(1600, 1200)).toBe('4:3');
  });

  it('picks 21:9 for ultrawide', () => {
    expect(selectAspectRatio(2100, 900)).toBe('21:9');
  });
});

describe('generateImage', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,XYZ' } }],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the base64 data URL from the response', async () => {
    const url = await generateImage({ prompt: 'a loaf of bread', width: 1600, height: 900 });
    expect(url).toBe('data:image/png;base64,XYZ');
  });

  it('sends the model + image_config in the body', async () => {
    await generateImage({ prompt: 'test', width: 1600, height: 900, size: '4K' });
    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('google/gemini-2.5-flash-image');
    expect(body.modalities).toEqual(['image', 'text']);
    expect(body.image_config).toEqual({ aspect_ratio: '16:9', image_size: '4K' });
  });

  it('defaults to 2K image size when not specified', async () => {
    await generateImage({ prompt: 'test', width: 1024, height: 1024 });
    const fetchMock = vi.mocked(global.fetch);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.image_config.image_size).toBe('2K');
  });

  it('throws when response status is not OK', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await expect(generateImage({ prompt: 'test', width: 1024, height: 1024 })).rejects.toThrow(
      /429/,
    );
  });

  it('throws when response has no image', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }),
    );
    await expect(generateImage({ prompt: 'test', width: 1024, height: 1024 })).rejects.toThrow(
      /no image/,
    );
  });
});
