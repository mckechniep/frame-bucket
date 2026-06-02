/* eslint-disable no-console */
/**
 * Iteration playground: run one iteration round against a previously archived
 * generation. Useful for fast iteration on the iteration prompt itself
 * without going through the wizard UI.
 *
 * Usage:
 *   pnpm iterate <archive-id> "<feedback>"
 *   pnpm iterate <archive-id> --feedback-file path/to/feedback.txt
 *   pnpm iterate <archive-id> "<feedback>" --brief-file path/to/brief.json
 *   pnpm iterate <archive-id> "<feedback>" --posture startup
 *
 * The aesthetic + layout pair is recovered from the parent archive's
 * recipeSummary (format: "<aestheticId> + <layoutId>", with any "(iter N)"
 * suffix stripped). The brief defaults to the Maple St Bakery brief used by
 * gen.ts/recommend.ts; override with --brief-file. Feedback can come from a
 * positional arg or from --feedback-file (avoids shell-escaping for long or
 * punctuation-heavy feedback).
 *
 * Requires: synced data/taxonomy.json (run /admin sync first), real
 * ANTHROPIC_API_KEY in .env.local, and an existing artifact under
 * tmp/generations/<archive-id>/.
 */
import { config as dotenvConfig } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
// Type-only imports are erased at compile time — they don't trigger
// runtime module loading, so it's safe to import @/lib/types here even
// before dotenv runs.
import type { Brief, Recipe, Posture } from '@/lib/types';

// Load .env.local BEFORE importing anything that touches @/env. The env
// module validates at module load; without this, the script crashes before
// main() runs.
const envLocal = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
  dotenvConfig({ path: envLocal, quiet: true });
}

interface CliArgs {
  archiveId: string;
  feedback: string;
  briefFile?: string;
  posture?: Posture;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const positional: string[] = [];
  let briefFile: string | undefined;
  let feedbackFile: string | undefined;
  let posture: Posture | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--brief-file' && args[i + 1]) {
      briefFile = args[++i];
    } else if (a === '--feedback-file' && args[i + 1]) {
      feedbackFile = args[++i];
    } else if (a === '--posture' && args[i + 1]) {
      posture = args[++i] as Posture;
    } else if (typeof a === 'string') {
      positional.push(a);
    }
  }

  const archiveId = positional[0];
  if (!archiveId) {
    console.error(
      'Usage: pnpm iterate <archive-id> ("<feedback>" | --feedback-file path) [--brief-file path] [--posture p]',
    );
    process.exit(1);
  }

  let feedback = positional[1];
  if (!feedback && feedbackFile) {
    feedback = fs.readFileSync(path.resolve(feedbackFile), 'utf-8').trim();
  }
  if (!feedback) {
    console.error('Feedback required. Provide as positional arg or via --feedback-file <path>.');
    process.exit(1);
  }

  return { archiveId, feedback, briefFile, posture };
}

// Replaces inline base64 image data URIs with OPENROUTER: placeholders so the
// previous-HTML payload sent to iteration stays under the model's context
// window. Used as a fallback for legacy archives that pre-date htmlSource
// capture; their original generation prompts are unrecoverable, so a generic
// alt-text-derived placeholder is the best we can do. Lossy by design.
function stripBase64Images(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
    if (!/\bsrc="data:image\//i.test(attrs)) return full;
    const altMatch = attrs.match(/\balt="([^"]*)"/i);
    const widthMatch = attrs.match(/\bwidth="(\d+)"/i);
    const heightMatch = attrs.match(/\bheight="(\d+)"/i);
    const alt = altMatch?.[1]?.trim() || 'image';
    const w = widthMatch?.[1] ?? '1024';
    const h = heightMatch?.[1] ?? '1024';
    return `<img src="OPENROUTER:${alt}" alt="${alt}" width="${w}" height="${h}">`;
  });
}

// Parses "editorial + editorial-spread" (or with a trailing "(iter N)"
// suffix that the caller has already stripped) into the id pair.
function parseRecipeIds(recipeSummary: string): { aestheticId: string; layoutId: string } | null {
  const cleaned = recipeSummary.replace(/\s*\(iter \d+\)\s*$/, '').trim();
  const match = cleaned.match(/^([\w-]+)\s*\+\s*([\w-]+)$/);
  if (!match) return null;
  const [, aestheticId, layoutId] = match;
  if (!aestheticId || !layoutId) return null;
  return { aestheticId, layoutId };
}

async function main(): Promise<void> {
  const { archiveId, feedback, briefFile, posture } = parseArgs();

  // Dynamic imports keep the env-touching modules out of the top-level
  // import chain, which fires before dotenv has populated process.env.
  const { assembleIterationRequest } = await import('@/lib/prompts/iteration-assembler');
  const { getAnthropicClient } = await import('@/lib/anthropic/client');
  const { defaultArchiveStore } = await import('@/lib/generation/archive');
  const { injectImages, countImagePlaceholders } = await import('@/lib/generation/inject-images');
  const { estimateCost, formatUsd } = await import('@/lib/cost');
  const { defaultFileStore } = await import('@/lib/taxonomy/file-store');

  const archive = defaultArchiveStore();
  const parent = await archive.read(archiveId);
  if (!parent) {
    console.error(`No archive found at tmp/generations/${archiveId}/.`);
    process.exit(1);
  }

  if (parent.iterationRound >= 3) {
    console.error(
      `Iteration limit reached (round ${parent.iterationRound}/3). Start a fresh generation to continue.`,
    );
    process.exit(1);
  }

  const ids = parseRecipeIds(parent.recipeSummary);
  if (!ids) {
    console.error(`Could not parse aesthetic/layout from recipeSummary: ${parent.recipeSummary}`);
    process.exit(1);
  }

  const store = defaultFileStore();
  const taxonomy = await store.get();
  if (!taxonomy) {
    console.error('No taxonomy cache. Sync from /admin first.');
    process.exit(1);
  }

  const aesthetic = taxonomy.aesthetics.find((e) => e.id === ids.aestheticId);
  const layout = taxonomy.layouts.find((e) => e.id === ids.layoutId);
  if (!aesthetic || !layout) {
    console.error(
      `Recipe ids from parent (${ids.aestheticId} + ${ids.layoutId}) no longer exist in taxonomy.`,
    );
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
      posture: 'boutique',
      description: 'Family-run bakery; avoid generic cafe tropes; warm and considered.',
    };
  }
  if (posture) {
    brief = { ...brief, posture };
  }

  const recipe: Recipe = { brief, aesthetic, layout };
  const childRound = parent.iterationRound + 1;

  // Prefer the captured pre-injection HTML (small, has placeholders the model
  // emitted). Fall back to a regex strip on legacy archives — lossy but the
  // only way to fit them in the context window.
  let previousHtml = parent.htmlSource;
  if (!previousHtml) {
    previousHtml = stripBase64Images(parent.html);
    console.warn(
      '[iterate] parent has no htmlSource; using regex-stripped HTML (image prompts will be generic).',
    );
  }

  const request = await assembleIterationRequest({
    recipe,
    previousHtml,
    previousArtifactId: archiveId,
    feedback,
  });
  const client = getAnthropicClient();
  console.log(
    `Calling ${request.model} for iteration round ${childRound} (parent: ${archiveId})...`,
  );

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

  const childId = await archive.save({
    recipeSummary: parent.recipeSummary,
    html,
    modelId: request.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cost,
    generatedAt: new Date().toISOString(),
    parentArtifactId: archiveId,
    iterationRound: childRound,
  });
  console.log(`Archived as: tmp/generations/${childId}/index.html`);
  console.log(`Parent: ${archiveId} | Round: ${childRound}/3`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
