import type { NextRequest } from 'next/server';
import { BriefSchema } from '@/lib/schemas/recommendation';
import { defaultFileStore } from '@/lib/taxonomy/file-store';
import { assembleRecommendationRequest } from '@/lib/prompts/recommendation-assembler';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { parseRecommendationResponse, RecommendationParseError } from '@/lib/recommendation/parse';
import { estimateCost } from '@/lib/cost';

export const runtime = 'nodejs';
export const maxDuration = 30;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: NextRequest) {
  // 1. Parse body — surface malformed JSON before Zod validation
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'malformed JSON body' }, { status: 400 });
  }

  // 2. Validate brief via BriefSchema
  const briefResult = BriefSchema.safeParse(body);
  if (!briefResult.success) {
    return Response.json(
      { error: 'invalid brief', issues: briefResult.error.issues },
      { status: 400 },
    );
  }
  const brief = briefResult.data;

  // 3. Load taxonomy — 503 if cache is absent (admin sync not yet run)
  const taxonomy = await defaultFileStore().get();
  if (!taxonomy) {
    return Response.json({ error: 'taxonomy not synced; run /admin sync first' }, { status: 503 });
  }

  // 4. Assemble recommendation request — guard against missing system.md
  let request;
  try {
    request = await assembleRecommendationRequest(brief, taxonomy);
  } catch (err) {
    return Response.json(
      { error: 'server prompt config missing', detail: errorMessage(err) },
      { status: 500 },
    );
  }

  // 5. Call Anthropic (non-streaming — recommendation output is small enough
  //    that streaming adds complexity without UX benefit)
  const client = getAnthropicClient();
  let response;
  try {
    response = await client.messages.create(
      {
        model: request.model,
        max_tokens: request.max_tokens,
        system: request.system,
        messages: request.messages,
      },
      { signal: req.signal },
    );
  } catch (err) {
    // Client disconnects (page reload, abort) surface as AbortError.
    // Don't log it as an error — it's expected on browser navigation/reload.
    if (err instanceof Error && (err.name === 'AbortError' || req.signal.aborted)) {
      return new Response(null, { status: 499 });
    }
    return Response.json(
      { error: 'upstream model error', detail: errorMessage(err) },
      { status: 502 },
    );
  }

  // 6. Pull text block from response
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'model response had no text content' }, { status: 502 });
  }
  const rawText = textBlock.text;

  // 7. Parse Haiku's JSON response — model output shape only (no metadata).
  //    Server fills in generatedAt + model below to produce the full envelope.
  let modelOutput;
  try {
    modelOutput = parseRecommendationResponse(rawText, taxonomy);
  } catch (err) {
    if (err instanceof RecommendationParseError) {
      // Surface the parser's specific message and any Zod issues so the
      // wizard error pane can diagnose schema-shape failures (e.g., a
      // reasoning string overshooting the cap) without us having to peek
      // at server logs.
      const cause = err.cause;
      type ZodLikeIssue = { path: Array<string | number>; message: string };
      const zodIssues =
        cause && typeof cause === 'object' && 'issues' in cause
          ? ((cause as { issues: ZodLikeIssue[] }).issues ?? [])
              .slice(0, 5)
              .map((i) => ({ path: i.path.join('.'), message: i.message }))
          : undefined;
      return Response.json(
        {
          error: 'invalid model response',
          detail: err.message,
          ...(zodIssues && zodIssues.length > 0 ? { issues: zodIssues } : {}),
          rawText: (err.rawText ?? rawText).slice(0, 500),
        },
        { status: 502 },
      );
    }
    throw err;
  }

  const recommendation = {
    ...modelOutput,
    generatedAt: new Date().toISOString(),
    model: request.model,
  };

  // 8. Build usage + cost and return
  const usage = {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  };
  const cost = estimateCost({
    model: request.model,
    inputTokens: usage.inputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    outputTokens: usage.outputTokens,
  });

  return Response.json({ recommendation, usage, cost });
}
