/**
 * Tests for /api/iterate route.
 *
 * Strategy: mirror the /api/generate route test harness exactly.
 * Mock the Anthropic client, archive store, and site store factory.
 * Consume the returned ReadableStream via collectEvents to assert SSE events.
 *
 * Key assertions for Task 16:
 *  - setPageArtifact called with (siteId, slug, artifactId) when both present
 *  - setPageArtifact NOT called when siteId/slug absent
 *  - done still fires when setPageArtifact returns null (unknown page)
 *  - setPageArtifact NOT called on abort path (Rule 9)
 *  - error event carries artifactId when setPageArtifact throws after successful save
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Recipe } from '@/lib/types';
import type { SitePage } from '@/lib/sites/site-store';

// ─── Mocks (must be declared before any dynamic imports) ─────────────────────

// Mock the env module so getAnthropicClient doesn't blow up on missing key.
vi.mock('@/env', () => {
  const testEnv: Record<string, string> = {};
  testEnv['ANTHROPIC_API_KEY'] = 'test-key';
  return { env: testEnv };
});

vi.mock('@/lib/prompts/iteration-assembler', () => ({
  assembleIterationRequest: vi.fn(),
}));

vi.mock('@/lib/generation/inject-images', () => ({
  injectImages: vi.fn(async (html: string) => html),
  countImagePlaceholders: vi.fn(() => 0),
}));

const mockStream = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropicClient: () => ({ messages: { stream: mockStream } }),
}));

// Archive store — read() supplies the parent artifact; save() returns the new id.
const mockArchiveRead = vi.fn();
const mockArchiveSave = vi.fn();
vi.mock('@/lib/generation/archive', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/generation/archive')>();
  return {
    ...original,
    defaultArchiveStore: vi.fn(() => ({
      save: mockArchiveSave,
      read: mockArchiveRead,
      exists: vi.fn(),
      existsMany: vi.fn(),
      getChildren: vi.fn(),
    })),
  };
});

// Site store factory — only setPageArtifact is exercised by this route.
const mockSetPageArtifact = vi.fn();
vi.mock('@/lib/sites/site-store-factory', () => ({
  defaultSiteStore: vi.fn(() => ({
    createSite: vi.fn(),
    addPage: vi.fn(),
    getSite: vi.fn(),
    removePage: vi.fn(),
    setPageArtifact: mockSetPageArtifact,
    listPages: vi.fn(),
  })),
  _resetSiteStoreCacheForTests: vi.fn(),
}));

// ─── Import subject AFTER mocks ───────────────────────────────────────────────

import { POST } from '../route';
import { assembleIterationRequest } from '@/lib/prompts/iteration-assembler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecipe(): Recipe {
  return {
    brief: {
      projectName: 'Test Project',
      industry: 'tech',
      posture: 'startup',
      description: 'A test project for unit testing.',
    },
    aesthetic: {
      id: 'aesthetic-1',
      name: 'Aesthetic',
      bucket: 'aesthetic',
      shortDefinition: 'Bold and expressive',
      coreMood: 'Energetic',
      bestUseCase: 'Startups',
      distinctiveSignals: ['strong typography'],
      notes: '',
      notionId: 'notion-aes-1',
      hasOverride: false,
    },
    layout: {
      id: 'layout-1',
      name: 'Layout',
      bucket: 'layout',
      shortDefinition: 'Grid-based layout',
      coreMood: 'Structured',
      bestUseCase: 'Landing pages',
      distinctiveSignals: ['clean grid'],
      notes: '',
      notionId: 'notion-lay-1',
      hasOverride: false,
    },
  };
}

const FAKE_ANTHROPIC_REQUEST = {
  model: 'claude-3-5-haiku-20241022',
  max_tokens: 8000,
  system: [],
  messages: [{ role: 'user' as const, content: 'Iterate this.' }],
  stream: true,
};

const FAKE_PARENT = {
  id: 'artifact-parent-001',
  recipeSummary: 'aesthetic-1 + layout-1',
  html: '<h1>Old</h1>',
  htmlSource: '<h1>Old</h1>',
  modelId: 'claude-3-5-haiku-20241022',
  inputTokens: 80,
  outputTokens: 40,
  cacheReadTokens: 0,
  cost: 0.0004,
  generatedAt: '2026-01-01T00:00:00.000Z',
  iterationRound: 0,
};

const FAKE_PAGE: SitePage = {
  siteId: 'site-deadbeef0001',
  slug: '/',
  title: 'Home',
  artifactId: 'artifact-iter-001',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function* makeChunks(html: string) {
  yield {
    type: 'message_start',
    message: {
      usage: { input_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  };
  yield { type: 'content_block_delta', delta: { type: 'text_delta', text: html } };
  yield { type: 'message_delta', usage: { output_tokens: 50 } };
}

async function* makeAbortChunks() {
  const e = new Error('Request was aborted.');
  e.name = 'AbortError';
  throw e;
}

function makeRequest(
  overrides: {
    siteId?: string;
    slug?: string;
  } = {},
): NextRequest {
  const body = JSON.stringify({
    recipe: makeRecipe(),
    previousArtifactId: 'artifact-parent-001',
    feedback: 'Make the hero section larger and bolder.',
    ...overrides,
  });
  return new NextRequest('http://localhost/api/iterate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

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
  vi.mocked(assembleIterationRequest).mockReset().mockResolvedValue(FAKE_ANTHROPIC_REQUEST);

  // mockArchiveRead and mockArchiveSave may be queued with ...Once in some
  // tests — use mockReset + default per the testing rules.
  mockArchiveRead.mockReset().mockResolvedValue(FAKE_PARENT);
  mockArchiveSave.mockReset().mockResolvedValue('artifact-iter-001');

  // mockSetPageArtifact may also receive ...Once queues.
  mockSetPageArtifact.mockReset().mockResolvedValue(FAKE_PAGE);

  mockStream.mockReset().mockReturnValue(makeChunks('<h1>Iterated</h1>'));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/iterate — validation', () => {
  it('returns 400 for malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/iterate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when previousArtifactId is missing', async () => {
    const req = new NextRequest('http://localhost/api/iterate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipe: makeRecipe(),
        feedback: 'Make it bigger.',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when parent artifact is not found', async () => {
    mockArchiveRead.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 429 when iteration round cap is reached', async () => {
    mockArchiveRead.mockResolvedValue({ ...FAKE_PARENT, iterationRound: 3 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });
});

describe('POST /api/iterate — happy path without siteId/slug', () => {
  it('emits a done event with artifactId when siteId/slug are absent', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const events = await collectEvents(res.body!);
    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();

    const payload = doneEvent!.data as Record<string, unknown>;
    expect(payload.artifactId).toBe('artifact-iter-001');
    expect(typeof payload.cost).toBe('number');
    expect(payload.imagesInjected).toBe(0);
  });

  it('does NOT call setPageArtifact when siteId/slug are absent', async () => {
    const res = await POST(makeRequest());
    await collectEvents(res.body!);

    expect(mockSetPageArtifact).not.toHaveBeenCalled();
  });
});

describe('POST /api/iterate — happy path with siteId + slug', () => {
  it('calls setPageArtifact with (siteId, slug, the new artifactId)', async () => {
    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/' }));
    await collectEvents(res.body!);

    expect(mockSetPageArtifact).toHaveBeenCalledOnce();
    expect(mockSetPageArtifact).toHaveBeenCalledWith('site-deadbeef0001', '/', 'artifact-iter-001');
  });

  it('setPageArtifact receives the exact artifactId returned by archive.save', async () => {
    const uniqueId = 'artifact-unique-iter-fk';
    mockArchiveSave.mockResolvedValue(uniqueId);
    mockSetPageArtifact.mockResolvedValue({ ...FAKE_PAGE, artifactId: uniqueId });

    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/' }));
    await collectEvents(res.body!);

    const setPageCall = mockSetPageArtifact.mock.calls[0] as [string, string, string];
    expect(setPageCall[2]).toBe(uniqueId);
  });

  it('done event carries the new artifactId after setPageArtifact succeeds', async () => {
    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/about' }));
    const events = await collectEvents(res.body!);

    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent!.data as Record<string, unknown>).artifactId).toBe('artifact-iter-001');
  });
});

describe('POST /api/iterate — setPageArtifact returns null (unknown site/slug)', () => {
  it('done still fires normally when setPageArtifact returns null', async () => {
    mockSetPageArtifact.mockResolvedValue(null);

    const res = await POST(makeRequest({ siteId: 'site-ghost', slug: '/nonexistent' }));
    const events = await collectEvents(res.body!);

    // done fires — the artifact is saved, only the page pointer update was a no-op
    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent!.data as Record<string, unknown>).artifactId).toBe('artifact-iter-001');
  });

  it('does NOT emit an error event when setPageArtifact returns null', async () => {
    mockSetPageArtifact.mockResolvedValue(null);

    const res = await POST(makeRequest({ siteId: 'site-ghost', slug: '/nonexistent' }));
    const events = await collectEvents(res.body!);

    expect(events.find((e) => e.event === 'error')).toBeUndefined();
  });
});

describe('POST /api/iterate — Rule 9: abort path creates NO artifact and does NOT advance page pointer', () => {
  it('does NOT call archive.save or setPageArtifact when stream throws AbortError', async () => {
    mockStream.mockReturnValue(makeAbortChunks());

    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/' }));
    expect(res.status).toBe(200);

    const events = await collectEvents(res.body!);

    // No 'done' event.
    expect(events.find((e) => e.event === 'done')).toBeUndefined();

    // Rule 9 core assertion.
    expect(mockArchiveSave).not.toHaveBeenCalled();
    expect(mockSetPageArtifact).not.toHaveBeenCalled();
  });

  it('does NOT emit an error event on AbortError (client already gone)', async () => {
    mockStream.mockReturnValue(makeAbortChunks());

    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/' }));
    const events = await collectEvents(res.body!);

    expect(events.find((e) => e.event === 'error')).toBeUndefined();
  });
});

describe('POST /api/iterate — error path (non-abort errors)', () => {
  it('emits an error event when archive.save throws, WITHOUT calling setPageArtifact', async () => {
    mockArchiveSave.mockRejectedValue(new Error('Disk full'));

    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/' }));
    const events = await collectEvents(res.body!);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as Record<string, unknown>).error).toContain('Disk full');

    // setPageArtifact must NOT be called when save fails.
    expect(mockSetPageArtifact).not.toHaveBeenCalled();
  });

  it('error event includes artifactId when setPageArtifact throws AFTER a successful save', async () => {
    // Partial-failure: save succeeded (archiveId is set) but setPageArtifact
    // throws. The error event must carry artifactId so the saved artifact
    // is recoverable (not a zombie).
    const savedId = 'artifact-zombie-iter';
    mockArchiveSave.mockResolvedValue(savedId);
    mockSetPageArtifact.mockRejectedValue(new Error('DB connection refused'));

    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/' }));
    const events = await collectEvents(res.body!);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent!.data as Record<string, unknown>;
    expect(payload.artifactId).toBe(savedId);
    expect(payload.error).toContain('DB connection refused');
  });

  it('error event does NOT include artifactId when save itself fails (nothing was saved)', async () => {
    mockArchiveSave.mockRejectedValue(new Error('Save failed'));

    const res = await POST(makeRequest({ siteId: 'site-deadbeef0001', slug: '/' }));
    const events = await collectEvents(res.body!);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent!.data as Record<string, unknown>;
    // No artifactId — nothing was saved, so there's nothing to recover.
    expect(payload.artifactId).toBeUndefined();
  });
});
