import { describe, it, expect } from 'vitest';
import {
  loadBaseCanon,
  loadAestheticOverride,
  loadOutputContract,
  listAestheticOverrides,
} from '../loader';

describe('prompt loaders', () => {
  it('loadBaseCanon returns non-empty markdown', async () => {
    const text = await loadBaseCanon();
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('#');
  });

  it('loadOutputContract returns non-empty markdown', async () => {
    const text = await loadOutputContract();
    expect(text.length).toBeGreaterThan(100);
  });

  it('loadAestheticOverride returns content for editorial', async () => {
    const text = await loadAestheticOverride('editorial');
    expect(text).toContain('Editorial');
  });

  it('loadAestheticOverride returns null for unknown id', async () => {
    expect(await loadAestheticOverride('nonexistent-xyz')).toBeNull();
  });

  it('listAestheticOverrides includes 4 seed ids', async () => {
    const ids = await listAestheticOverrides();
    expect(ids).toEqual(
      expect.arrayContaining(['editorial', 'swiss', 'brutalist-neo-brutalist', 'corporate-clean']),
    );
  });
});
