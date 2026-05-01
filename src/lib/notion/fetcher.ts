import type { Client } from '@notionhq/client';

export interface NotionPageLike {
  id: string;
  properties: Record<string, unknown>;
}

type QueryResponse = {
  results: NotionPageLike[];
  has_more: boolean;
  next_cursor: string | null;
};

export async function fetchBucket(client: Client, dataSourceId: string): Promise<NotionPageLike[]> {
  const pages: NotionPageLike[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;
  while (hasMore) {
    const response = (await client.dataSources.query({
      data_source_id: dataSourceId,
      ...(cursor ? { start_cursor: cursor } : {}),
      page_size: 100,
    })) as unknown as QueryResponse;
    pages.push(...response.results);
    hasMore = response.has_more;
    cursor = response.next_cursor ?? undefined;
  }
  return pages;
}
