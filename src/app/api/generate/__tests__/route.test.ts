/**
 * Tests for /api/generate route.
 *
 * Strategy: mock the Anthropic client so `messages.stream()` yields a
 * controlled sequence of SSE chunks via an async generator.  Mock the archive
 * store and site store so we can spy on save/createSite/addPage without
 * touching the filesystem or Supabase.  Then call POST() and consume the
 * returned ReadableStream to collect all SSE events.
 *
 * Limitations:
 *  - We don't test injectImages (mocked to a no-op) — that logic has its own
 *    unit tests.
 *  - The real AbortSignal wiring between Next.js and the Anthropic SDK is
 *    verified structurally (the error-path check) rather than via an actual
 *    OS-level abort, because Node's ReadableStream controller doesn't expose
 *    a cancel callback in Vitest's environment the same way a browser does.
 *    We simulate abort by having the async generator throw an AbortError.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Recipe } from '@/lib/types';
import type { SiteRecord, SitePage } from '@/lib/sites/site-store';

// ─── Mocks (must be declared before any dynamic imports) ─────────────────────

// Mock the env module so getAnthropicClient doesn't blow up on missing API key.
vi.mock('@/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key' },
}));

// Mock the prompts assembler so we skip file I/O.
vi.mock('@/lib/prompts/assembler', () => ({
  assembleGenerationRequest: vi.fn(),
}));

// Mock inject-images so we don't hit external image APIs.
vi.mock('@/lib/generation/inject-images', () => ({
  injectImages: vi.fn(async (html: string) => html),
  countImagePlaceholders: vi.fn(() => 0),
}));

// Mock the Anthropic client — stream() returns an async iterable of chunks.
const mockStream = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropicClient: () => ({ messages: { stream: mockStream } }),
}));

// Mock the archive store factory.
const mockArchiveSave = vi.fn();
vi.mock('@/lib/generation/archive', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/generation/archive')>();
  return {
    ...original,
    defaultArchiveStore: vi.fn(() => ({
      save: mockArchiveSave,
      exists: vi.fn(),
      existsMany: vi.fn(),
      read: vi.fn(),
      getChildren: vi.fn(),
    })),
  };
});

// Mock the site store factory.
const mockCreateSite = vi.fn();
const mockAddPage = vi.fn();
vi.mock('@/lib/sites/site-store-factory', () => ({
  defaultSiteStore: vi.fn(() => ({
    createSite: mockCreateSite,
    addPage: mockAddPage,
    getSite: vi.fn(),
    removePage: vi.fn(),
    setPageArtifact: vi.fn(),
    listPages: vi.fn(),
  })),
  _resetSiteStoreCacheForTests: vi.fn(),
}));

// ─── Import subject AFTER mocks ───────────────────────────────────────────────

import { POST } from '../route';
import { assembleGenerationRequest } from '@/lib/prompts/assembler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal Recipe fixture. */
function makeRecipe(projectName = 'Test Project'): Recipe {
  return {
    brief: {
      projectName,
      industry: 'tech',
      posture: 'startup',
    },
    aesthetic: {
      id: 'aesthetic-1',
      name: 'Aesthetic',
      bucket: 'aesthetic',
      shortDefinition: '',
      coreMood: '',
      bestUseCase: '',
      distinctiveSignals: [],
      notes: '',
      notionId: '',
      hasOverride: false,
    },
    layout: {
      id: 'layout-1',
      name: 'Layout',
      bucket: 'layout',
      shortDefinition: '',
      coreMood: '',
      bestUseCase: '',
      distinctiveSignals: [],
      notes: '',
      notionId: '',
      hasOverride: false,
    },
  };
}

/** Minimal assembled request returned by the mocked assembler. */
const FAKE_REQUEST = {
  model: 'claude-3-5-haiku-20241022',
  max_tokens: 8000,
  system: [],
  messages: [{ role: 'user' as const, content: 'Build me a site.' }],
  stream: true,
};

/**
 * Builds an async generator that yields Anthropic stream chunks matching the
 * subset of shapes the route cares about, then returns.
 */
async function* makeChunks(html: string) {
  yield {
    type: 'message_start',
    message: {
      usage: {
        input_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  };
  yield {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: html },
  };
  yield {
    type: 'message_delta',
    usage: { output_tokens: 50 },
  };
}

/**
 * An async generator that immediately throws an AbortError, simulating the
 * Anthropic SDK throwing when the request signal fires.
 */

async function* makeAbortChunks(_html: string) {
  const e = new Error('Request was aborted.');
  e.name = 'AbortError';
  throw e;
  // Unreachable yield to satisfy the generator return type.
  yield {
    type: 'message_start' as const,
    message: {
      usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  };
}

/** Build a NextRequest with an optional AbortSignal. */
function makeRequest(recipe: Recipe, signal?: AbortSignal): NextRequest {
  const body = JSON.stringify({ recipe });
  return new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal,
  });
}

/**
 * Consume a ReadableStream<Uint8Array> and collect all SSE events.
 * Returns an array of { event, data } objects.
 */
async function collectEvents(
  stream: ReadableStream<Uint8Array>,
): Promise<Array<{ event: string; data: unknown }>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: Array<{ event: string; data: unknown }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }

  // Parse SSE format: "event: <name>\ndata: <json>\n\n"
  const blocks = buf.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    const eventLine = lines.find((l) => l.startsWith('event:'));
    const dataLine = lines.find((l) => l.startsWith('data:'));
    if (eventLine && dataLine) {
      const event = eventLine.replace('event:', '').trim();
      const data = JSON.parse(dataLine.replace('data:', '').trim()) as unknown;
      events.push({ event, data });
    }
  }

  return events;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(assembleGenerationRequest).mockReset().mockResolvedValue(FAKE_REQUEST);

  // mockStream and mockArchiveSave use mockReset + default per testing rules
  // (they are queued with ...Once in some tests).
  mockArchiveSave.mockReset().mockResolvedValue('artifact-abc-123');

  mockCreateSite.mockReset().mockResolvedValue({
    id: 'site-deadbeef0001',
    name: 'Test Project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } satisfies SiteRecord);

  mockAddPage.mockReset().mockResolvedValue({
    siteId: 'site-deadbeef0001',
    slug: '/',
    title: 'Home',
    artifactId: 'artifact-abc-123',
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies SitePage);

  // Default: yield a minimal successful stream. Tests that need a different
  // stream (abort, error injection) override this with mockReturnValue.
  mockStream.mockReset().mockReturnValue(makeChunks('<h1>Default</h1>'));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/generate — validation', () => {
  it('returns 400 when recipe is missing required buckets (no aesthetic.id)', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipe: {
          brief: { projectName: 'X', industry: 'y', posture: 'startup' },
          layout: { id: 'l-1' },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when recipe is missing layout.id', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipe: {
          brief: { projectName: 'X', industry: 'y', posture: 'startup' },
          aesthetic: { id: 'a-1' },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/generate — happy path (site creation)', () => {
  it('emits a done event that includes siteId alongside artifactId', async () => {
    mockStream.mockReturnValue(makeChunks('<h1>Hello</h1>'));

    const res = await POST(makeRequest(makeRecipe()));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const events = await collectEvents(res.body!);
    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();

    const payload = doneEvent!.data as Record<string, unknown>;
    expect(payload.artifactId).toBe('artifact-abc-123');
    expect(payload.siteId).toBe('site-deadbeef0001');
    expect(typeof payload.cost).toBe('number');
    expect(payload.imagesInjected).toBe(0);
  });

  it('calls createSite with the recipe brief projectName', async () => {
    mockStream.mockReturnValue(makeChunks('<h1>Site</h1>'));

    // Must consume the response stream: the ReadableStream start() callback
    // (which contains all the side-effectful logic) only runs when a consumer
    // pulls from the stream.
    const res = await POST(makeRequest(makeRecipe('My Awesome Brand')));
    await collectEvents(res.body!);

    expect(mockCreateSite).toHaveBeenCalledOnce();
    expect(mockCreateSite).toHaveBeenCalledWith({ name: 'My Awesome Brand' });
  });

  it('calls addPage with slug "/", title "Home", the saved artifactId, and position 0', async () => {
    const savedId = 'artifact-xyz-999';
    mockArchiveSave.mockResolvedValue(savedId);

    mockStream.mockReturnValue(makeChunks('<h1>Site</h1>'));

    const res = await POST(makeRequest(makeRecipe()));
    await collectEvents(res.body!);

    expect(mockAddPage).toHaveBeenCalledOnce();
    expect(mockAddPage).toHaveBeenCalledWith('site-deadbeef0001', {
      slug: '/',
      title: 'Home',
      artifactId: savedId,
      position: 0,
    });
  });

  it('addPage receives the same artifactId that archive.save returned', async () => {
    // This test verifies the FK relationship: the page must reference the
    // artifact that was just saved, not a stale or placeholder id.
    const uniqueId = 'artifact-unique-fk-test';
    mockArchiveSave.mockResolvedValue(uniqueId);
    mockStream.mockReturnValue(makeChunks('<p>page</p>'));

    const res = await POST(makeRequest(makeRecipe()));
    await collectEvents(res.body!);

    const addPageCall = mockAddPage.mock.calls[0] as [string, { artifactId: string }];
    expect(addPageCall[1].artifactId).toBe(uniqueId);
  });

  it('archive.save is called BEFORE createSite (FK ordering)', async () => {
    // Verify execution order: save first, then site creation.
    const order: string[] = [];
    mockArchiveSave.mockImplementation(async () => {
      order.push('save');
      return 'artifact-order-test';
    });
    mockCreateSite.mockImplementation(async () => {
      order.push('createSite');
      return { id: 'site-order', name: 'x', createdAt: '', updatedAt: '' } satisfies SiteRecord;
    });
    mockAddPage.mockImplementation(async () => {
      order.push('addPage');
      return {
        siteId: 'site-order',
        slug: '/',
        title: 'Home',
        artifactId: 'artifact-order-test',
        position: 0,
        createdAt: '',
      } satisfies SitePage;
    });
    mockStream.mockReturnValue(makeChunks('<p>order</p>'));

    const res = await POST(makeRequest(makeRecipe()));
    await collectEvents(res.body!);

    expect(order).toEqual(['save', 'createSite', 'addPage']);
  });
});

describe('POST /api/generate — Rule 9: abort path creates NO artifact and NO site', () => {
  it('does NOT call archive.save or createSite when the stream throws AbortError', async () => {
    // Simulate the Anthropic SDK throwing AbortError (client disconnected).
    mockStream.mockReturnValue(makeAbortChunks('<h1>Never saved</h1>'));

    const res = await POST(makeRequest(makeRecipe()));

    // The route should still return a valid SSE response (the stream is
    // created synchronously before the error surfaces inside the ReadableStream
    // controller's start() callback).
    expect(res.status).toBe(200);

    // Consume the stream so the controller's start() runs to completion.
    const events = await collectEvents(res.body!);

    // No 'done' event — the generation was abandoned.
    expect(events.find((e) => e.event === 'done')).toBeUndefined();

    // Rule 9 core assertion: no side effects on abort.
    expect(mockArchiveSave).not.toHaveBeenCalled();
    expect(mockCreateSite).not.toHaveBeenCalled();
    expect(mockAddPage).not.toHaveBeenCalled();
  });

  it('does NOT emit an error event on AbortError (client already gone)', async () => {
    mockStream.mockReturnValue(makeAbortChunks(''));

    const res = await POST(makeRequest(makeRecipe()));
    const events = await collectEvents(res.body!);

    // AbortError is swallowed cleanly — no 'error' event reaches the client.
    expect(events.find((e) => e.event === 'error')).toBeUndefined();
  });
});

describe('POST /api/generate — error path (non-abort error)', () => {
  it('emits an error event when archive.save throws a non-abort error', async () => {
    mockStream.mockReturnValue(makeChunks('<h1>Ok stream</h1>'));
    mockArchiveSave.mockRejectedValue(new Error('Disk full'));

    const res = await POST(makeRequest(makeRecipe()));
    const events = await collectEvents(res.body!);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as Record<string, unknown>).error).toContain('Disk full');

    // createSite must NOT be called when save fails.
    expect(mockCreateSite).not.toHaveBeenCalled();
  });

  it('emits an error event when createSite throws, and does NOT emit done', async () => {
    mockStream.mockReturnValue(makeChunks('<h1>Ok stream</h1>'));
    mockCreateSite.mockRejectedValue(new Error('DB connection refused'));

    const res = await POST(makeRequest(makeRecipe()));
    const events = await collectEvents(res.body!);

    expect(events.find((e) => e.event === 'done')).toBeUndefined();
    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
  });
});
