/* eslint-disable no-console */
/**
 * Prompt playground: generate one HTML file from the synced taxonomy and
 * archive the result. Useful for fast iteration on canon + override changes
 * without going through the wizard UI.
 *
 * Usage:
 *   pnpm gen [aestheticId] [layoutId]
 *   pnpm gen editorial editorial-spread       # explicit
 *   pnpm gen swiss bento                       # different recipe
 *
 * Requires: synced data/taxonomy.json (run /admin sync first), real
 * ANTHROPIC_API_KEY in .env.local.
 */
import { config as dotenvConfig } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
// Type-only imports are erased at compile time — they don't trigger
// runtime module loading, so it's safe to import @/lib/types here even
// before dotenv runs.
import type { Recipe } from '@/lib/types';

// Load .env.local BEFORE importing anything that touches @/env. The env
// module validates at module load; without this, the script crashes before
// main() runs.
const envLocal = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
  dotenvConfig({ path: envLocal, quiet: true });
}

async function main(): Promise<void> {
  const [, , aestheticId = 'editorial', layoutId = 'editorial-spread'] = process.argv;

  // Dynamic imports keep the env-touching modules out of the top-level
  // import chain, which fires before dotenv has populated process.env.
  const { assembleGenerationRequest } = await import('@/lib/prompts/assembler');
  const { getAnthropicClient } = await import('@/lib/anthropic/client');
  const { defaultArchiveStore } = await import('@/lib/generation/archive');
  const { injectImages, countImagePlaceholders } = await import('@/lib/generation/inject-images');
  const { estimateCost, formatUsd } = await import('@/lib/cost');
  const { defaultFileStore } = await import('@/lib/taxonomy/file-store');

  const store = defaultFileStore();
  const taxonomy = await store.get();
  if (!taxonomy) {
    console.error('No taxonomy cache. Sync from /admin first.');
    process.exit(1);
  }

  const aesthetic = taxonomy.aesthetics.find((e) => e.id === aestheticId);
  const layout = taxonomy.layouts.find((e) => e.id === layoutId);
  if (!aesthetic || !layout) {
    console.error(`Unknown aesthetic/layout: ${aestheticId} / ${layoutId}`);
    console.error(`Available aesthetics: ${taxonomy.aesthetics.map((e) => e.id).join(', ')}`);
    console.error(`Available layouts: ${taxonomy.layouts.map((e) => e.id).join(', ')}`);
    process.exit(1);
  }

  const recipe: Recipe = {
    brief: {
      projectName: 'Maple St Bakery',
      industry: 'Food & Beverage',
      vibe: 'mom-and-pop',
      description: 'Family-run bakery; avoid generic cafe tropes; warm and considered.',
    },
    aesthetic,
    layout,
  };

  const request = await assembleGenerationRequest(recipe);
  const client = getAnthropicClient();
  console.log(`Calling ${request.model} for ${aestheticId} + ${layoutId}...`);

  const t0 = Date.now();
  const streamResp = client.messages.stream({
    model: request.model,
    max_tokens: request.max_tokens,
    system: request.system,
    messages: request.messages,
  });

  let html = '';
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  for await (const chunk of streamResp) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      html += chunk.delta.text;
      process.stdout.write('.');
    } else if (chunk.type === 'message_start') {
      const u = chunk.message.usage;
      usage.inputTokens = u.input_tokens ?? 0;
      usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
    } else if (chunk.type === 'message_delta') {
      usage.outputTokens = chunk.usage.output_tokens ?? usage.outputTokens;
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const cost = estimateCost({ model: request.model, ...usage });
  console.log('\n');
  console.log(`Elapsed: ${elapsed}s`);
  console.log(
    `Tokens — in: ${usage.inputTokens}, cacheRead: ${usage.cacheReadTokens}, out: ${usage.outputTokens}`,
  );
  console.log(`Cost: ${formatUsd(cost)}`);

  const placeholderCount = countImagePlaceholders(html);
  if (placeholderCount > 0) {
    console.log(
      `Generating ${placeholderCount} image${placeholderCount === 1 ? '' : 's'} via OpenRouter...`,
    );
    const tImg = Date.now();
    html = await injectImages(html);
    console.log(`Images: ${((Date.now() - tImg) / 1000).toFixed(1)}s`);
  }

  const archive = defaultArchiveStore();
  const id = await archive.save({
    recipeSummary: `${aesthetic.id} + ${layout.id}`,
    html,
    modelId: request.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cost,
    generatedAt: new Date().toISOString(),
  });
  console.log(`Archived as: tmp/generations/${id}/index.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
