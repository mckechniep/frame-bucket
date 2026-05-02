import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Editorial')).toBe('editorial');
  });
  it('handles slashes and multi-word names', () => {
    expect(slugify('Brutalist / Neo-Brutalist')).toBe('brutalist-neo-brutalist');
  });
  it('strips special chars and collapses dashes', () => {
    expect(slugify('Y2K / Retro-Futurist!')).toBe('y2k-retro-futurist');
  });
  it('trims leading and trailing dashes', () => {
    expect(slugify('  --Cyberpunk--  ')).toBe('cyberpunk');
  });
});
