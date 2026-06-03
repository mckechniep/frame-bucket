import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { defaultArchiveStore } from '@/lib/generation/archive';
import { injectImages, countImagePlaceholders } from '@/lib/generation/inject-images';
import { estimateCost } from '@/lib/cost';
import { defaultSiteStore } from '@/lib/sites/site-store-factory';
import { isValidSlug } from '@/lib/sites/slug';
import { hasNavMarkers } from '@/lib/sites/nav-injector';
import type { NavPage } from '@/lib/sites/nav-injector';
import { deriveContract } from '@/lib/contract/derive';
import { assembleSubpageRequest } from '@/lib/prompts/subpage-assembler';
import type { AnthropicRequest } from '@/lib/prompts/assembler';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PostBodySchema = z.object({
  slug: z.string(),
  title: z.string().trim().min(1).max(60),
  brief: z.string().trim().min(10).max(2000),
});

const DeleteBodySchema = z.object({
  slug: z.string(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface UsageTracking {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * Runs a single Anthropic streaming call and accumulates the full HTML and
 * usage. Returns { html, usage } when the stream completes.
 *
 * Both `stream` calls (first attempt + retry) go through this helper so that
 * abort-signal wiring, chunk accumulation, and usage tracking are always
 * applied identically — Rule 9 compliance.
 */
async function runStream(
  client: ReturnType<typeof getAnthropicClient>,
  request: AnthropicRequest,
  signal: AbortSignal,
): Promise<{ html: string; usage: UsageTracking }> {
  let html = '';
  const usage: UsageTracking = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  // Wire abort signal verbatim from generate route — Rule 9.
  const streamResp = client.messages.stream(
    {
      model: request.model,
      max_tokens: request.max_tokens,
      system: request.system,
      messages: request.messages,
    },
    { signal },
  );

  for await (const chunk of streamResp) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      html += chunk.delta.text;
    } else if (chunk.type === 'message_start') {
      const u = chunk.message.usage;
      usage.inputTokens = u.input_tokens ?? 0;
      usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
      usage.cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
    } else if (chunk.type === 'message_delta') {
      usage.outputTokens = chunk.usage.output_tokens ?? usage.outputTokens;
    }
  }

  return { html, usage };
}

// ─── POST ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/site/[siteId]/page
 *
 * Generates a new subpage that matches the site's design contract, validates
 * the required nav markers (one retry), and persists the artifact + page row.
 *
 * Rules 8 (cache) + 9 (billable stream with abort-safe abort wiring).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  // ── 1. Params ────────────────────────────────────────────────────────────
  const { siteId } = await params;

  // ── 2. Body validation ────────────────────────────────────────────────────
  const body = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? 'invalid request body' }, 400);
  }
  const { slug, title, brief } = parsed.data;

  // ── 3. Slug validation (Rule 4 — validate before any DB) ─────────────────
  // Note: "/" IS a valid slug per isValidSlug (it passes SLUG_REGEX and is not
  // in RESERVED_SLUGS). But we still allow "/" only for the existing landing
  // page — the duplicate-slug check below will reject a second "/" insertion.
  if (!isValidSlug(slug)) {
    return jsonResponse({ error: 'invalid slug' }, 400);
  }

  // ── 4. Site lookup ────────────────────────────────────────────────────────
  const siteStore = defaultSiteStore();
  const site = await siteStore.getSite(siteId);
  if (!site) {
    return jsonResponse({ error: 'site not found' }, 404);
  }

  // ── 5. Page list + guards ─────────────────────────────────────────────────
  const pages = await siteStore.listPages(siteId);
  const landingPage = pages.find((p) => p.slug === '/');
  if (!landingPage) {
    return jsonResponse({ error: 'no landing page exists for this site', code: 'NO_LANDING' }, 400);
  }
  if (pages.some((p) => p.slug === slug)) {
    return jsonResponse(
      { error: 'a page with this slug already exists', code: 'SLUG_EXISTS' },
      409,
    );
  }

  // ── 6. Landing artifact check ─────────────────────────────────────────────
  const archive = defaultArchiveStore();
  const landing = await archive.read(landingPage.artifactId);
  if (!landing) {
    return jsonResponse(
      {
        error: 'landing artifact not found in archive; regenerate the site first',
        code: 'LEGACY_ARTIFACT',
      },
      400,
    );
  }

  // ── 7. Nav marker check (legacy detection) ────────────────────────────────
  const landingHtml = landing.htmlSource ?? landing.html;
  if (!hasNavMarkers(landingHtml)) {
    return jsonResponse(
      {
        error: 'landing page has no nav markers; regenerate it to add subpages',
        code: 'LEGACY_ARTIFACT',
      },
      400,
    );
  }

  // ── 8. Derive design contract ─────────────────────────────────────────────
  const contract = await deriveContract(landingPage.artifactId, site.name);

  // ── 9. Build nav manifest (existing pages + the new page being created) ───
  const navManifest: NavPage[] = [
    ...pages.map((p) => ({ slug: p.slug, title: p.title, position: p.position })),
    { slug, title, position: pages.length },
  ];

  // ── 10. Assemble the Anthropic request ────────────────────────────────────
  // landingStructure = raw HTML; assembleSubpageRequest calls outlineHtml() internally.
  const request = await assembleSubpageRequest({
    contractMd: contract.contractMd,
    pageBrief: brief,
    pageTitle: title,
    pageSlug: slug,
    navManifest,
    landingStructure: landingHtml,
  });

  const client = getAnthropicClient();

  // ── 11-16. SSE stream with marker validation + one retry ──────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let archiveId: string | undefined;

      try {
        // ── First stream attempt ───────────────────────────────────────────
        const { html: firstHtml, usage: firstUsage } = await runStream(client, request, req.signal);

        // Emit deltas inline — we've already buffered, so send as one delta.
        // (For a streaming UX, we could yield chunks; this mirrors generate's
        // behaviour where we send the whole chunk as a single delta event.)
        send('delta', { text: firstHtml });

        let finalHtml = firstHtml;
        let finalUsage = firstUsage;

        // ── Marker validation + one retry ─────────────────────────────────
        if (!hasNavMarkers(firstHtml)) {
          // Reinforce the directive in the user message and retry ONCE.
          const firstContent = request.messages[0]?.content ?? '';
          const reinforcedContent =
            firstContent +
            '\n\nIMPORTANT: your previous attempt omitted the required ' +
            '<!-- fb:nav-links:start --> / <!-- fb:nav-links:end --> markers. ' +
            'You MUST include them around the nav anchors.';

          const reinforcedRequest = {
            ...request,
            messages: [
              { role: 'user' as const, content: reinforcedContent },
              ...request.messages.slice(1),
            ],
          };

          const { html: retryHtml, usage: retryUsage } = await runStream(
            client,
            reinforcedRequest,
            req.signal,
          );

          send('delta', { text: retryHtml });

          if (!hasNavMarkers(retryHtml)) {
            // Both attempts failed — do NOT save, do NOT addPage.
            send('error', {
              code: 'MARKERS_MISSING',
              error:
                'Generated HTML is missing the required nav markers after two attempts; please try again.',
            });
            return;
          }

          finalHtml = retryHtml;
          // Accumulate usage across both attempts (both are billable).
          finalUsage = {
            inputTokens: firstUsage.inputTokens + retryUsage.inputTokens,
            outputTokens: firstUsage.outputTokens + retryUsage.outputTokens,
            cacheReadTokens: firstUsage.cacheReadTokens + retryUsage.cacheReadTokens,
            cacheCreationTokens: firstUsage.cacheCreationTokens + retryUsage.cacheCreationTokens,
          };
        }

        // ── Image injection (after marker validation, before save) ────────
        const htmlSource = finalHtml;
        const placeholderCount = countImagePlaceholders(finalHtml);
        if (placeholderCount > 0) {
          send('images_started', { count: placeholderCount });
          finalHtml = await injectImages(finalHtml);
          send('images_done', { count: placeholderCount });
        }

        const cost = estimateCost({
          model: request.model,
          inputTokens: finalUsage.inputTokens,
          cacheReadTokens: finalUsage.cacheReadTokens,
          outputTokens: finalUsage.outputTokens,
        });

        // ── Persist artifact (FK must exist before addPage) ───────────────
        archiveId = await archive.save({
          recipeSummary: `subpage:${slug}`,
          html: finalHtml,
          htmlSource,
          modelId: request.model,
          inputTokens: finalUsage.inputTokens,
          outputTokens: finalUsage.outputTokens,
          cacheReadTokens: finalUsage.cacheReadTokens,
          cost,
          generatedAt: new Date().toISOString(),
          iterationRound: 0,
        });

        // ── Register page row ─────────────────────────────────────────────
        await siteStore.addPage(siteId, {
          slug,
          title,
          artifactId: archiveId,
          position: pages.length,
        });

        send('done', {
          artifactId: archiveId,
          slug,
          usage: finalUsage,
          cost,
          html: finalHtml,
        });
      } catch (err) {
        // Client disconnect / abort — no save, no addPage, no error event.
        if (err instanceof Error && (err.name === 'AbortError' || req.signal.aborted)) {
          return;
        }
        // Non-abort error — include archiveId if save succeeded so the saved
        // artifact can be recovered (mirrors generate route's zombie guard).
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

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * DELETE /api/site/[siteId]/page
 *
 * Removes a page row from the site. Rule 6: artifacts are NEVER deleted —
 * only the page row is removed. Returns { removed: boolean }.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<Response> {
  const { siteId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? 'invalid request body' }, 400);
  }
  const { slug } = parsed.data;

  // Home page cannot be deleted via this endpoint.
  if (slug === '/') {
    return jsonResponse(
      { error: 'the home page cannot be deleted', code: 'CANNOT_DELETE_HOME' },
      400,
    );
  }

  const siteStore = defaultSiteStore();
  const removed = await siteStore.removePage(siteId, slug);

  return jsonResponse({ removed }, 200);
}
