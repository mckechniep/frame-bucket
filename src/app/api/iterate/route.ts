import type { NextRequest } from 'next/server';
import { IterationRequestSchema } from '@/lib/schemas/iteration';
import { assembleIterationRequest } from '@/lib/prompts/iteration-assembler';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { defaultArchiveStore } from '@/lib/generation/archive';
import { injectImages, countImagePlaceholders } from '@/lib/generation/inject-images';
import { estimateCost } from '@/lib/cost';
import { defaultSiteStore } from '@/lib/sites/site-store-factory';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Kill-switch audit (T11 — 5-point checklist from spec)
// [1] _form.tsx effect deps: not in scope for this route, tracked in T12.
// [2] Trigger button disabled while in-flight: tracked in T12.
// [3] Client-side AbortController with cleanup: tracked in T12.
// [4] ✅ req.signal passed to client.messages.stream() — see below.
// [5] ✅ AbortError caught; returns WITHOUT saving archive or emitting 'done' — see catch block.
// ---------------------------------------------------------------------------

interface UsageTracking {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'iteration failed';
}

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // 1. Parse + validate body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'malformed JSON body' }, { status: 400 });
  }

  const parsed = IterationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid iteration request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const request = parsed.data;

  // -------------------------------------------------------------------------
  // 2. Parent artifact lookup
  // -------------------------------------------------------------------------
  const archive = defaultArchiveStore();
  const parent = await archive.read(request.previousArtifactId);
  if (!parent) {
    return Response.json(
      { error: 'parent artifact not found', id: request.previousArtifactId },
      { status: 404 },
    );
  }

  // -------------------------------------------------------------------------
  // 3. Round cap — max 3 iterations per chain
  // -------------------------------------------------------------------------
  if (parent.iterationRound >= 3) {
    return Response.json(
      { error: 'iteration limit reached', limit: 3, currentRound: parent.iterationRound },
      { status: 429 },
    );
  }

  const childRound = parent.iterationRound + 1;

  // -------------------------------------------------------------------------
  // 4. Assemble Anthropic request
  // -------------------------------------------------------------------------
  // The client passes its current view of previousHtml in the request body,
  // but we override with the parent's stored htmlSource when available — that
  // is the model's actual output (with OPENROUTER: placeholders) before image
  // injection bloated it with multi-MB base64 data URIs. Falling through to
  // the client-supplied HTML keeps the route working for legacy archives, at
  // the (real) risk of blowing the context window for image-heavy parents.
  const previousHtml = parent.htmlSource ?? request.previousHtml;

  let anthropicRequest: Awaited<ReturnType<typeof assembleIterationRequest>>;
  try {
    anthropicRequest = await assembleIterationRequest({ ...request, previousHtml });
  } catch (err) {
    const detail = errorMessage(err);
    return Response.json({ error: 'server prompt config missing', detail }, { status: 500 });
  }

  const client = getAnthropicClient();

  // -------------------------------------------------------------------------
  // 5. Stream SSE response — mirrors /api/generate exactly
  // -------------------------------------------------------------------------
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let html = '';
      let archiveId: string | undefined;
      const usage: UsageTracking = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      };

      try {
        // [Kill-switch point 4] Pass req.signal so the SDK stops consuming
        // tokens when the browser disconnects — no more paying for abandoned streams.
        const streamResp = client.messages.stream(
          {
            model: anthropicRequest.model,
            max_tokens: anthropicRequest.max_tokens,
            system: anthropicRequest.system,
            messages: anthropicRequest.messages,
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

        // Snapshot the model's actual output before injectImages — same
        // architecture as /api/generate. Iteration on iteration must keep
        // forwarding the placeholder version as previous-HTML, never the
        // post-injection version.
        const htmlSource = html;
        // Inject images for any OPENROUTER: placeholder <img> tags.
        const placeholderCount = countImagePlaceholders(html);
        if (placeholderCount > 0) {
          send('images_started', { count: placeholderCount });
          html = await injectImages(html);
          send('images_done', { count: placeholderCount });
        }

        const cost = estimateCost({
          model: anthropicRequest.model,
          inputTokens: usage.inputTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          cacheReadTokens: usage.cacheReadTokens,
          outputTokens: usage.outputTokens,
        });

        // Archive with parent linking and iteration round.
        // The archive's save() strips any existing "(iter N)" suffix from
        // recipeSummary and appends the new round label since childRound > 0.
        archiveId = await archive.save({
          recipeSummary: parent.recipeSummary,
          html,
          htmlSource,
          modelId: anthropicRequest.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cost,
          generatedAt: new Date().toISOString(),
          parentArtifactId: request.previousArtifactId,
          iterationRound: childRound,
        });

        // Advance the page pointer so the wizard's "latest = active" model holds.
        // Both fields are optional — older callers and direct CLI usage may omit
        // them. When present, a null return means the site/slug is unknown;
        // warn but don't fail — the artifact is already saved and the done event
        // must still fire. If setPageArtifact throws (DB error), the catch block
        // will carry archiveId so the saved artifact is recoverable.
        const { siteId, slug } = request;
        if (siteId && slug) {
          const updated = await defaultSiteStore().setPageArtifact(siteId, slug, archiveId);
          if (!updated) {
            logger.warn(
              '[iterate] setPageArtifact found no page; artifact saved but page pointer not advanced',
              { siteId, slug },
            );
          }
        }

        send('done', {
          artifactId: archiveId,
          // siteId mirrors /api/generate so the wizard's setSiteId(stream.siteId)
          // stays correct after a refine. Undefined for non-site flows; the
          // wizard guards `if (stream.siteId)` before acting on it.
          ...(siteId !== undefined ? { siteId } : {}),
          usage,
          cost,
          imagesInjected: placeholderCount,
          html,
        });
      } catch (err) {
        // [Kill-switch point 5] Client disconnects (page reload, AbortController
        // cleanup) surface as AbortError. Do NOT save an archive and do NOT
        // emit 'done' — there is no client listening and the work was abandoned.
        if (err instanceof Error && (err.name === 'AbortError' || req.signal.aborted)) {
          return;
        }
        // Include archiveId if archive.save succeeded before the failure —
        // the saved artifact is otherwise an unreachable zombie with no recovery path.
        send('error', {
          error: errorMessage(err),
          ...(archiveId ? { artifactId: archiveId } : {}),
        });
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
