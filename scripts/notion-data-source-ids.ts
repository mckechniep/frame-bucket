/* eslint-disable no-console */
/**
 * One-shot helper: convert Notion database IDs (or URLs) into v5 data source IDs.
 *
 * Usage:
 *   NOTION_API_KEY=secret_xxx pnpm tsx scripts/notion-data-source-ids.ts <url-or-id> [<url-or-id> ...]
 *
 * Or set NOTION_API_KEY in .env.local and run:
 *   pnpm tsx scripts/notion-data-source-ids.ts <url-or-id> [<url-or-id> ...]
 *
 * Required: the integration owning NOTION_API_KEY must be shared with each DB
 * (Notion → open DB → ⋯ → Connections → add integration). Otherwise: 404.
 */
import { Client } from '@notionhq/client';
import { config as dotenvConfig } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const envLocal = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
  dotenvConfig({ path: envLocal, quiet: true });
}

const HEX_32 = /^[a-f0-9]{32}$/i;

function extractDbId(input: string): string {
  // Strip dashes so dashed UUIDs (1af9e241-a70a-...) and URL forms both work.
  const dashless = input.trim().replace(/-/g, '');
  if (HEX_32.test(dashless)) return dashless;
  const match = dashless.match(/([a-f0-9]{32})/i);
  if (match?.[1]) return match[1];
  throw new Error(`Not a Notion database ID or URL: ${input}`);
}

interface NotionDbShape {
  title?: Array<{ plain_text?: string }>;
  data_sources?: Array<{ id: string; name?: string }>;
}

async function main(): Promise<void> {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('Error: NOTION_API_KEY not set.');
    console.error('  Add it to .env.local, or pass via shell:');
    console.error('  NOTION_API_KEY=secret_xxx pnpm tsx scripts/notion-data-source-ids.ts <urls>');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      'Usage: pnpm tsx scripts/notion-data-source-ids.ts <url-or-id> [<url-or-id> ...]',
    );
    console.error('  Pass each DB URL (or 32-char hex ID) as a separate argument.');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });

  for (const arg of args) {
    let dbId: string;
    try {
      dbId = extractDbId(arg);
    } catch (err) {
      console.error(`\n${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    try {
      const db = (await notion.databases.retrieve({
        database_id: dbId,
      })) as unknown as NotionDbShape;

      const title = db.title?.[0]?.plain_text ?? '<untitled>';
      const dataSources = db.data_sources ?? [];

      console.log(`\nDatabase: "${title}"`);
      console.log(`  database_id:    ${dbId}`);

      if (dataSources.length === 0) {
        console.log(`  data_source_id: <none — Notion-Version may not support v5>`);
        continue;
      }

      const first = dataSources[0];
      if (dataSources.length === 1 && first) {
        console.log(`  data_source_id: ${first.id}`);
      } else {
        console.log(`  data_source_ids (${dataSources.length} found, pick one):`);
        for (const ds of dataSources) {
          console.log(`    ${ds.id}  (${ds.name ?? '<unnamed>'})`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nError fetching ${dbId}: ${message}`);
      if (/404|not.found|object_not_found/i.test(message)) {
        console.error('  Likely cause: integration is not shared with this DB.');
        console.error('  Fix: Notion → open DB → ⋯ → Connections → add your integration.');
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
