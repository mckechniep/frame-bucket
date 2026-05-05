import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectImages, countImagePlaceholders } from '../inject-images';
import { generateImage } from '@/lib/openrouter/image';

vi.mock('@/lib/openrouter/image', () => ({
  generateImage: vi.fn(),
}));

describe('countImagePlaceholders', () => {
  it('returns 0 when no placeholders exist', () => {
    expect(countImagePlaceholders('<img src="https://example.com/foo.jpg">')).toBe(0);
    expect(countImagePlaceholders('<p>no images at all</p>')).toBe(0);
  });

  it('counts OPENROUTER placeholders', () => {
    const html = `
      <img src="OPENROUTER:a loaf of bread" width="1600" height="900">
      <img src="https://other.com/x.jpg" width="100" height="100">
      <img src="OPENROUTER:a baker at work" width="900" height="1200">
    `;
    expect(countImagePlaceholders(html)).toBe(2);
  });
});

describe('injectImages', () => {
  beforeEach(() => {
    vi.mocked(generateImage).mockReset();
  });

  it('returns html unchanged when no placeholders exist', async () => {
    const html = '<p>nothing here</p><img src="https://x.com/y.jpg">';
    const out = await injectImages(html);
    expect(out).toBe(html);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('replaces a single placeholder with the generated data URL', async () => {
    vi.mocked(generateImage).mockResolvedValueOnce('data:image/png;base64,LOAF');
    const html = '<img src="OPENROUTER:a loaf of bread" width="1600" height="900" alt="bread">';
    const out = await injectImages(html);
    expect(out).toContain('src="data:image/png;base64,LOAF"');
    expect(out).not.toContain('OPENROUTER:');
    expect(generateImage).toHaveBeenCalledWith({
      prompt: 'a loaf of bread',
      width: 1600,
      height: 900,
      size: undefined,
    });
  });

  it('replaces multiple placeholders in parallel with respective images', async () => {
    vi.mocked(generateImage)
      .mockResolvedValueOnce('data:image/png;base64,A')
      .mockResolvedValueOnce('data:image/png;base64,B');
    const html = `
      <img src="OPENROUTER:bread" width="1600" height="900">
      <img src="OPENROUTER:baker" width="900" height="1200">
    `;
    const out = await injectImages(html);
    expect(out).toContain('data:image/png;base64,A');
    expect(out).toContain('data:image/png;base64,B');
    expect(out).not.toContain('OPENROUTER:');
    expect(generateImage).toHaveBeenCalledTimes(2);
  });

  it('preserves other img attributes (alt, loading, etc.)', async () => {
    vi.mocked(generateImage).mockResolvedValueOnce('data:image/png;base64,X');
    const html =
      '<img src="OPENROUTER:test" width="900" height="1200" alt="A baker" loading="lazy">';
    const out = await injectImages(html);
    expect(out).toContain('alt="A baker"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('width="900"');
    expect(out).toContain('height="1200"');
  });

  it('defaults to 1024x1024 when width/height attrs are missing', async () => {
    vi.mocked(generateImage).mockResolvedValueOnce('data:image/png;base64,X');
    await injectImages('<img src="OPENROUTER:test">');
    expect(generateImage).toHaveBeenCalledWith({
      prompt: 'test',
      width: 1024,
      height: 1024,
      size: undefined,
    });
  });

  it('passes through size option to generateImage', async () => {
    vi.mocked(generateImage).mockResolvedValueOnce('data:image/png;base64,X');
    await injectImages('<img src="OPENROUTER:test" width="1600" height="900">', { size: '4K' });
    expect(generateImage).toHaveBeenCalledWith({
      prompt: 'test',
      width: 1600,
      height: 900,
      size: '4K',
    });
  });

  it('propagates errors from image generation', async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error('rate limited'));
    await expect(
      injectImages('<img src="OPENROUTER:test" width="900" height="900">'),
    ).rejects.toThrow(/rate limited/);
  });
});
