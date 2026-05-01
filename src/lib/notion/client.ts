import { Client } from '@notionhq/client';
import { env } from '@/env';

let _client: Client | null = null;

export function getNotionClient(): Client {
  if (!_client) {
    _client = new Client({ auth: env.NOTION_API_KEY });
  }
  return _client;
}
