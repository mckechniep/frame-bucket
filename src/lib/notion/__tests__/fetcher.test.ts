import { describe, it, expect, vi } from 'vitest';
import type { Client } from '@notionhq/client';
import { fetchBucket } from '../fetcher';

describe('fetchBucket', () => {
  it('paginates and collects results', async () => {
    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce({
        results: [{ id: 'p1' }, { id: 'p2' }],
        has_more: true,
        next_cursor: 'cur-1',
      })
      .mockResolvedValueOnce({
        results: [{ id: 'p3' }],
        has_more: false,
        next_cursor: null,
      });
    const mockClient = { dataSources: { query: mockQuery } } as unknown as Client;
    const pages = await fetchBucket(mockClient, 'ds-id-123');
    expect(pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      data_source_id: 'ds-id-123',
      start_cursor: 'cur-1',
      page_size: 100,
    });
  });
});
