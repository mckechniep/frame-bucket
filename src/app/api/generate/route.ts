import type { NextRequest } from 'next/server';
import { assembleGenerationRequest } from '@/lib/prompts/assembler';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { defaultArchiveStore } from '@/lib/generation/archive';
import { injectImages, countImagePlaceholders } from '@/lib/generation/inject-images';
import { estimateCost } from '@/lib/cost';
import type { Recipe } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface UsageTracking {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { recipe: Recipe };
  const recipe = body.recipe;
  if (!recipe?.aesthetic?.id || !recipe.layout?.id) {
    return new Response(JSON.stringify({ error: 'recipe missing required buckets' }), {
      status: 400,
    });
  }

  const request = await assembleGenerationRequest(recipe);
  const client = getAnthropicClient();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let html = '';
      const usage: UsageTracking = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      };

      try {
        // Wire the client's abort signal into the Anthropic SDK call. When the
        // browser disconnects (page reload, useEffect cleanup, AbortController),
        // the SDK stops consuming tokens — no more paying for abandoned streams.
        const streamResp = client.messages.stream(
          {
            model: request.model,
            max_tokens: request.max_tokens,
            system: request.system,
            messages: request.messages,
          },
          { signal: req.signal },
        );

        for await (const chunk of streamResp) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            html += chunk.delta.text;
            send('delta', { text: chunk.delta.text });
          } else if (chunk.type === 'message_start') {
            const u = chunk.message.usage;
            usage.inputTokens = u.input_tokens ?? 0;
            usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
            usage.cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
          } else if (chunk.type === 'message_delta') {
            usage.outputTokens = chunk.usage.output_tokens ?? usage.outputTokens;
          }
        }

        // Snapshot model output BEFORE image injection — see gen.ts comment.
        const htmlSource = html;
        // Inject images for any OPENROUTER: placeholder <img> tags.
        const placeholderCount = countImagePlaceholders(html);
        if (placeholderCount > 0) {
          send('images_started', { count: placeholderCount });
          html = await injectImages(html);
          send('images_done', { count: placeholderCount });
        }

        const cost = estimateCost({
          model: request.model,
          inputTokens: usage.inputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          outputTokens: usage.outputTokens,
        });

        const archive = defaultArchiveStore();
        const archiveId = await archive.save({
          recipeSummary: `${recipe.aesthetic.id} + ${recipe.layout.id}`,
          html,
          htmlSource,
          modelId: request.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cost,
          generatedAt: new Date().toISOString(),
        });

        send('done', {
          artifactId: archiveId,
          usage,
          cost,
          imagesInjected: placeholderCount,
          html,
        });
      } catch (err) {
        // Client disconnects (page reload, abort) surface as AbortError.
        // Don't save an archive or send 'done' — there's no client listening
        // and the work was abandoned. Just close the controller cleanly.
        if (err instanceof Error && (err.name === 'AbortError' || req.signal.aborted)) {
          return;
        }
        send('error', { error: errorMessage(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed (client disconnected). Ignore.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
