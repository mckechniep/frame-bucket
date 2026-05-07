/* eslint-disable no-console */
/**
 * Recommendation playground: fire the recommender against the synced taxonomy
 * and print ranked picks per bucket. Useful for fast iteration on the
 * recommendation prompt without going through the wizard UI.
 *
 * Usage:
 *   pnpm recommend
 *   pnpm recommend --vibe scrappy-startup
 *   pnpm recommend --brief-file path/to/brief.json
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
import type { Brief, Vibe } from '@/lib/types';

// Load .env.local BEFORE importing anything that touches @/env. The env
// module validates at module load; without this, the script crashes before
// main() runs.
const envLocal = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
  dotenvConfig({ path: envLocal, quiet: true });
}

function parseArgs(): { briefFile?: string; vibe?: Vibe } {
  const args = process.argv.slice(2);
  const result: { briefFile?: string; vibe?: Vibe } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--brief-file' && args[i + 1]) {
      result.briefFile = args[++i];
    } else if (args[i] === '--vibe' && args[i + 1]) {
      result.vibe = args[++i] as Vibe;
    }
  }
  return result;
}

async function main(): Promise<void> {
  const { briefFile, vibe } = parseArgs();

  // Dynamic imports keep the env-touching modules out of the top-level
  // import chain, which fires before dotenv has populated process.env.
  const { assembleRecommendationRequest } = await import('@/lib/prompts/recommendation-assembler');
  const { getAnthropicClient } = await import('@/lib/anthropic/client');
  const { parseRecommendationResponse } = await import('@/lib/recommendation/parse');
  const { estimateCost, formatUsd } = await import('@/lib/cost');
  const { defaultFileStore } = await import('@/lib/taxonomy/file-store');

  const store = defaultFileStore();
  const taxonomy = await store.get();
  if (!taxonomy) {
    console.error('No taxonomy cache. Sync from /admin first.');
    process.exit(1);
  }

  let brief: Brief;
  if (briefFile) {
    const raw = fs.readFileSync(path.resolve(briefFile), 'utf-8');
    brief = JSON.parse(raw) as Brief;
  } else {
    brief = {
      projectName: 'Maple St Bakery',
      industry: 'Food & Beverage',
      vibe: 'mom-and-pop',
      description: 'Family-run bakery; avoid generic cafe tropes; warm and considered.',
    };
  }

  // CLI --vibe flag overrides whatever the brief file had
  if (vibe) {
    brief = { ...brief, vibe };
  }

  const request = await assembleRecommendationRequest(brief, taxonomy);
  const client = getAnthropicClient();
  console.log(`Calling ${request.model} for recommendation...`);

  const t0 = Date.now();
  const response = await client.messages.create({
    model: request.model,
    max_tokens: request.max_tokens,
    system: request.system,
    messages: request.messages,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const usage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  };
  const cost = estimateCost({ model: request.model, ...usage });

  console.log(`Elapsed: ${elapsed}s`);
  console.log(
    `Tokens — in: ${usage.inputTokens}, cacheRead: ${usage.cacheReadTokens}, out: ${usage.outputTokens}`,
  );
  console.log(`Cost: ${formatUsd(cost)}`);
  console.log('');

  // Pull text block — same type guard as the route handler
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    console.error('Model response had no text content');
    process.exit(1);
  }

  const result = parseRecommendationResponse(textBlock.text, taxonomy);

  const buckets: Array<{ label: string; picks: typeof result.aesthetics }> = [
    { label: 'Aesthetics', picks: result.aesthetics },
    { label: 'Layouts', picks: result.layouts },
    { label: 'Interactions', picks: result.interactions },
    { label: 'Systems', picks: result.systems },
  ];

  for (const { label, picks } of buckets) {
    if (picks.length === 0) continue;
    console.log(`## ${label}`);
    for (const pick of picks) {
      console.log(`• ${pick.entryName} (${pick.confidence.toFixed(2)}) — ${pick.reasoning}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
