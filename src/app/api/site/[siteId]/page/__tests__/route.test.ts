/**
 * Tests for POST /api/site/[siteId]/page and DELETE /api/site/[siteId]/page.
 *
 * Strategy mirrors /api/generate tests:
 *   - Mock the Anthropic client so messages.stream() yields a controlled async
 *     generator of SSE chunks.
 *   - Mock site store, archive store, deriveContract, and subpage assembler so
 *     we never hit Supabase or the filesystem.
 *   - Consume the ReadableStream to collect all SSE events via collectEvents().
 *
 * Marker retry mechanics:
 *   - mockStream is called once or twice depending on whether the first attempt
 *     includes nav markers.
 *   - Tests use mockReturnValueOnce / mockReturnValue to control each attempt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SiteRecord, SitePage } from '@/lib/sites/site-store';
import type { ArchiveRecord } from '@/lib/generation/archive';

// ─── Mocks (must be declared before dynamic imports) ─────────────────────────

vi.mock('@/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key' },
}));

vi.mock('@/lib/prompts/subpage-assembler', () => ({
  assembleSubpageRequest: vi.fn(),
}));

vi.mock('@/lib/generation/inject-images', () => ({
  injectImages: vi.fn(async (html: string) => html),
  countImagePlaceholders: vi.fn(() => 0),
}));

const mockStream = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropicClient: () => ({ messages: { stream: mockStream } }),
}));

const mockArchiveSave = vi.fn();
const mockArchiveRead = vi.fn();
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

const mockGetSite = vi.fn();
const mockListPages = vi.fn();
const mockAddPage = vi.fn();
const mockRemovePage = vi.fn();
vi.mock('@/lib/sites/site-store-factory', () => ({
  defaultSiteStore: vi.fn(() => ({
    getSite: mockGetSite,
    listPages: mockListPages,
    addPage: mockAddPage,
    removePage: mockRemovePage,
    createSite: vi.fn(),
    setPageArtifact: vi.fn(),
  })),
  _resetSiteStoreCacheForTests: vi.fn(),
}));

vi.mock('@/lib/contract/derive', () => ({
  deriveContract: vi.fn(),
}));

// ─── Import subject AFTER mocks ───────────────────────────────────────────────

import { POST, DELETE } from '../route';
import { assembleSubpageRequest } from '@/lib/prompts/subpage-assembler';
import { deriveContract } from '@/lib/contract/derive';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SITE_ID = 'site-abc123def456';

const FAKE_SITE: SiteRecord = {
  id: SITE_ID,
  name: 'Test Site',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LANDING_ARTIFACT_ID = 'artifact-landing-001';

const LANDING_PAGE: SitePage = {
  siteId: SITE_ID,
  slug: '/',
  title: 'Home',
  artifactId: LANDING_ARTIFACT_ID,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** HTML with valid nav markers */
const HTML_WITH_MARKERS = `<html><body><!-- fb:nav-links:start --><a href="/">Home</a><!-- fb:nav-links:end --><h1>Test</h1></body></html>`;

/** HTML without nav markers */
const HTML_WITHOUT_MARKERS = `<html><body><h1>No markers here</h1></body></html>`;

const LANDING_RECORD: ArchiveRecord = {
  recipeSummary: 'aesthetic-1 + layout-1',
  html: HTML_WITH_MARKERS,
  htmlSource: HTML_WITH_MARKERS,
  modelId: 'claude-opus-4-7',
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cost: 0.005,
  generatedAt: '2026-01-01T00:00:00.000Z',
  iterationRound: 0,
};

const FAKE_ASSEMBLED_REQUEST = {
  model: 'claude-opus-4-7',
  max_tokens: 32000,
  system: [],
  messages: [{ role: 'user' as const, content: 'Generate the About page.' }],
  stream: true,
};

// ─── SSE stream helpers ────────────────────────────────────────────────────────

async function* makeChunks(html: string) {
  yield {
    type: 'message_start',
    message: {
      usage: {
        input_tokens: 100,
        cache_read_input_tokens: 20,
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
    usage: { output_tokens: 200 },
  };
}

async function* makeAbortChunks() {
  const e = new Error('Request was aborted.');
  e.name = 'AbortError';
  throw e;
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

function makePostRequest(body: Record<string, unknown>, signal?: AbortSignal): NextRequest {
  return new NextRequest(`http://localhost/api/site/${SITE_ID}/page`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

function makeDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/site/${SITE_ID}/page`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FAKE_PARAMS = Promise.resolve({ siteId: SITE_ID });

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset with defaults per TypeScript testing rules (tests use ...Once variants)
  mockStream.mockReset().mockReturnValue(makeChunks(HTML_WITH_MARKERS));
  mockArchiveSave.mockReset().mockResolvedValue('artifact-new-page-001');
  mockArchiveRead.mockReset().mockResolvedValue(LANDING_RECORD);
  mockGetSite.mockReset().mockResolvedValue(FAKE_SITE);
  mockListPages.mockReset().mockResolvedValue([LANDING_PAGE]);
  mockAddPage.mockReset().mockResolvedValue({
    siteId: SITE_ID,
    slug: '/about',
    title: 'About',
    artifactId: 'artifact-new-page-001',
    position: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies SitePage);
  mockRemovePage.mockReset().mockResolvedValue(true);
  vi.mocked(deriveContract)
    .mockReset()
    .mockResolvedValue({
      contractMd: '# Design Contract\n\nSome design rules.',
      tokensJson: '{}',
      tokensCss: '',
      tokens: {
        colors: [],
        fonts: [],
        typeScale: [],
        spacing: [],
        other: [],
        meta: { extractedFrom: LANDING_ARTIFACT_ID, recipeSummary: '', fallback: false },
      },
      modelId: 'claude-haiku-4-5',
      cost: 0.001,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  vi.mocked(assembleSubpageRequest).mockReset().mockResolvedValue(FAKE_ASSEMBLED_REQUEST);
});

// ─── POST validation tests ────────────────────────────────────────────────────

describe('POST /api/site/[siteId]/page — body validation', () => {
  it('returns 400 when body is missing slug', async () => {
    const req = makePostRequest({ title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBeDefined();
  });

  it('returns 400 when title is empty', async () => {
    const req = makePostRequest({ slug: '/about', title: '', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 400 when title exceeds 60 characters', async () => {
    const req = makePostRequest({
      slug: '/about',
      title: 'A'.repeat(61),
      brief: 'A page about us.',
    });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 400 when brief is fewer than 10 characters', async () => {
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'Short' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 400 when brief exceeds 2000 characters', async () => {
    const req = makePostRequest({
      slug: '/about',
      title: 'About',
      brief: 'B'.repeat(2001),
    });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body JSON is malformed', async () => {
    const req = new NextRequest(`http://localhost/api/site/${SITE_ID}/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/site/[siteId]/page — slug validation', () => {
  it('returns 400 for invalid slug (no leading slash)', async () => {
    const req = makePostRequest({ slug: 'about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(String(json.error)).toMatch(/slug/i);
  });

  it('returns 400 for a reserved slug (/admin)', async () => {
    const req = makePostRequest({ slug: '/admin', title: 'Admin', brief: 'Admin section here.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(String(json.error)).toMatch(/slug/i);
  });

  it('returns 400 for slug with uppercase', async () => {
    const req = makePostRequest({
      slug: '/About',
      title: 'About',
      brief: 'A page about us.',
    });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
  });

  it('does NOT call the Anthropic stream for an invalid slug', async () => {
    const req = makePostRequest({ slug: 'noslash', title: 'X', brief: 'Some brief text here.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    expect(mockStream).not.toHaveBeenCalled();
  });
});

describe('POST /api/site/[siteId]/page — guard checks', () => {
  it('returns 404 when site does not exist', async () => {
    mockGetSite.mockResolvedValue(null);
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(404);
  });

  it('returns 400 NO_LANDING when no landing page exists', async () => {
    mockListPages.mockResolvedValue([]);
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe('NO_LANDING');
  });

  it('returns 409 SLUG_EXISTS when slug is already taken', async () => {
    mockListPages.mockResolvedValue([
      LANDING_PAGE,
      {
        siteId: SITE_ID,
        slug: '/about',
        title: 'About',
        artifactId: 'artifact-existing',
        position: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      } satisfies SitePage,
    ]);
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(409);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe('SLUG_EXISTS');
  });

  it('returns 400 LEGACY_ARTIFACT when landing artifact is missing from archive', async () => {
    mockArchiveRead.mockResolvedValue(null);
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe('LEGACY_ARTIFACT');
  });

  it('returns 400 LEGACY_ARTIFACT when landing HTML has no nav markers', async () => {
    mockArchiveRead.mockResolvedValue({
      ...LANDING_RECORD,
      html: HTML_WITHOUT_MARKERS,
      htmlSource: HTML_WITHOUT_MARKERS,
    });
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe('LEGACY_ARTIFACT');
  });

  it('does NOT call the Anthropic stream for guard failures', async () => {
    mockGetSite.mockResolvedValue(null);
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    await POST(req, { params: FAKE_PARAMS });
    expect(mockStream).not.toHaveBeenCalled();
  });
});

// ─── POST happy path ──────────────────────────────────────────────────────────

describe('POST /api/site/[siteId]/page — happy path', () => {
  it('returns SSE stream with content-type text/event-stream', async () => {
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
  });

  it('emits a done event with artifactId, slug, usage, cost, and html', async () => {
    const savedId = 'artifact-subpage-001';
    mockArchiveSave.mockResolvedValue(savedId);
    mockStream.mockReturnValue(makeChunks(HTML_WITH_MARKERS));

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();
    const payload = doneEvent!.data as Record<string, unknown>;
    expect(payload.artifactId).toBe(savedId);
    expect(payload.slug).toBe('/about');
    expect(typeof payload.cost).toBe('number');
    expect(typeof payload.usage).toBe('object');
    expect(typeof payload.html).toBe('string');
  });

  it('emits exactly ONE delta event containing the final saved html', async () => {
    mockStream.mockReturnValue(makeChunks(HTML_WITH_MARKERS));

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    const deltaEvents = events.filter((e) => e.event === 'delta');
    expect(deltaEvents).toHaveLength(1);
    // The single delta should contain the final (saved) html
    const deltaPayload = deltaEvents[0]!.data as Record<string, unknown>;
    expect(deltaPayload.text).toBe(HTML_WITH_MARKERS);
  });

  it('calls archive.save with the generated HTML', async () => {
    mockStream.mockReturnValue(makeChunks(HTML_WITH_MARKERS));

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    await collectEvents(res.body!);

    expect(mockArchiveSave).toHaveBeenCalledOnce();
    const savedRecord = mockArchiveSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(typeof savedRecord.html).toBe('string');
  });

  it('calls addPage with (siteId, {slug, title, artifactId, position})', async () => {
    const savedId = 'artifact-add-page-test';
    mockArchiveSave.mockResolvedValue(savedId);
    mockStream.mockReturnValue(makeChunks(HTML_WITH_MARKERS));

    const req = makePostRequest({
      slug: '/about',
      title: 'About Us',
      brief: 'Tell us about the team.',
    });
    const res = await POST(req, { params: FAKE_PARAMS });
    await collectEvents(res.body!);

    expect(mockAddPage).toHaveBeenCalledOnce();
    expect(mockAddPage).toHaveBeenCalledWith(SITE_ID, {
      slug: '/about',
      title: 'About Us',
      artifactId: savedId,
      position: 1, // existing pages.length = 1 (just the landing page)
    });
  });

  it('derives contract using the landing page artifactId', async () => {
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    await collectEvents(res.body!);

    expect(vi.mocked(deriveContract)).toHaveBeenCalledWith(LANDING_ARTIFACT_ID, FAKE_SITE.name);
  });

  it('passes raw HTML (not outline) to assembleSubpageRequest as landingStructure', async () => {
    // The assembler calls outlineHtml() internally; route passes raw HTML
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    await collectEvents(res.body!);

    expect(assembleSubpageRequest).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(assembleSubpageRequest).mock.calls[0]![0];
    // landingStructure should be the raw HTML string, not a summary
    expect(callArgs.landingStructure).toBe(HTML_WITH_MARKERS);
  });

  it('includes the new page in the navManifest passed to assembleSubpageRequest', async () => {
    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    await collectEvents(res.body!);

    const callArgs = vi.mocked(assembleSubpageRequest).mock.calls[0]![0];
    const slugs = callArgs.navManifest.map((p) => p.slug);
    expect(slugs).toContain('/');
    expect(slugs).toContain('/about');
  });
});

// ─── POST marker retry tests ──────────────────────────────────────────────────

describe('POST /api/site/[siteId]/page — marker retry (Rule 9)', () => {
  it('retries once when first stream output lacks nav markers, succeeds on second', async () => {
    // First attempt: no markers. Second: markers present.
    // makeChunks yields: input_tokens=100, cache_read=20, cache_creation=0, output_tokens=200
    // So two attempts should sum to: inputTokens=200, cacheReadTokens=40, outputTokens=400
    mockStream
      .mockReturnValueOnce(makeChunks(HTML_WITHOUT_MARKERS))
      .mockReturnValueOnce(makeChunks(HTML_WITH_MARKERS));

    const savedId = 'artifact-retry-success';
    mockArchiveSave.mockResolvedValue(savedId);

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    // Two stream calls were made
    expect(mockStream).toHaveBeenCalledTimes(2);

    // Save was called (retry succeeded)
    expect(mockArchiveSave).toHaveBeenCalledOnce();

    // done event was emitted
    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();
    const payload = doneEvent!.data as Record<string, unknown>;
    expect(payload.artifactId).toBe(savedId);

    // Usage must be the SUM of both attempts' tokens (guards accumulation block)
    const usage = payload.usage as Record<string, number>;
    expect(usage.inputTokens).toBe(200); // 100 + 100
    expect(usage.outputTokens).toBe(400); // 200 + 200
    expect(usage.cacheReadTokens).toBe(40); // 20 + 20

    // Exactly ONE delta event, containing the retry (final saved) html — not the first attempt's
    const deltaEvents = events.filter((e) => e.event === 'delta');
    expect(deltaEvents).toHaveLength(1);
    const deltaPayload = deltaEvents[0]!.data as Record<string, unknown>;
    expect(deltaPayload.text).toBe(HTML_WITH_MARKERS);
  });

  it('emits MARKERS_MISSING error when both attempts lack markers', async () => {
    mockStream
      .mockReturnValueOnce(makeChunks(HTML_WITHOUT_MARKERS))
      .mockReturnValueOnce(makeChunks(HTML_WITHOUT_MARKERS));

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    // Both stream attempts were made (exactly 2, no more)
    expect(mockStream).toHaveBeenCalledTimes(2);

    // No save, no addPage
    expect(mockArchiveSave).not.toHaveBeenCalled();
    expect(mockAddPage).not.toHaveBeenCalled();

    // error event with MARKERS_MISSING code
    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent!.data as Record<string, unknown>;
    expect(payload.code).toBe('MARKERS_MISSING');

    // No delta emitted when no valid html was produced
    expect(events.filter((e) => e.event === 'delta')).toHaveLength(0);
  });

  it('does NOT emit a done event when double marker failure occurs', async () => {
    mockStream
      .mockReturnValueOnce(makeChunks(HTML_WITHOUT_MARKERS))
      .mockReturnValueOnce(makeChunks(HTML_WITHOUT_MARKERS));

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    expect(events.find((e) => e.event === 'done')).toBeUndefined();
  });

  it('retry attempt honors abort signal — AbortError in retry also short-circuits', async () => {
    // First attempt succeeds but lacks markers, second (retry) throws AbortError
    mockStream
      .mockReturnValueOnce(makeChunks(HTML_WITHOUT_MARKERS))
      .mockReturnValueOnce(makeAbortChunks());

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    expect(mockArchiveSave).not.toHaveBeenCalled();
    expect(mockAddPage).not.toHaveBeenCalled();
    expect(events.find((e) => e.event === 'done')).toBeUndefined();
    expect(events.find((e) => e.event === 'error')).toBeUndefined();
  });
});

// ─── POST abort path ──────────────────────────────────────────────────────────

describe('POST /api/site/[siteId]/page — Rule 9: abort path', () => {
  it('does NOT call archive.save or addPage when stream throws AbortError', async () => {
    mockStream.mockReturnValue(makeAbortChunks());

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });

    expect(res.status).toBe(200);
    const events = await collectEvents(res.body!);

    expect(events.find((e) => e.event === 'done')).toBeUndefined();
    expect(mockArchiveSave).not.toHaveBeenCalled();
    expect(mockAddPage).not.toHaveBeenCalled();
  });

  it('does NOT emit an error event on AbortError', async () => {
    mockStream.mockReturnValue(makeAbortChunks());

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    expect(events.find((e) => e.event === 'error')).toBeUndefined();
  });
});

// ─── POST partial-failure tests ───────────────────────────────────────────────

describe('POST /api/site/[siteId]/page — partial-failure (Rule 9 artifact recovery)', () => {
  it('error event carries artifactId when addPage throws after save succeeds', async () => {
    const savedId = 'artifact-partial-fail-001';
    mockArchiveSave.mockResolvedValue(savedId);
    mockAddPage.mockRejectedValue(new Error('SLUG_EXISTS conflict'));
    mockStream.mockReturnValue(makeChunks(HTML_WITH_MARKERS));

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent!.data as Record<string, unknown>;
    expect(payload.artifactId).toBe(savedId);
    expect(typeof payload.error).toBe('string');
  });

  it('emits error event (no artifactId) when archive.save itself throws', async () => {
    mockArchiveSave.mockRejectedValue(new Error('Storage failure'));
    mockStream.mockReturnValue(makeChunks(HTML_WITH_MARKERS));

    const req = makePostRequest({ slug: '/about', title: 'About', brief: 'A page about us.' });
    const res = await POST(req, { params: FAKE_PARAMS });
    const events = await collectEvents(res.body!);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    const payload = errorEvent!.data as Record<string, unknown>;
    expect(payload.artifactId).toBeUndefined();
    expect(mockAddPage).not.toHaveBeenCalled();
  });
});

// ─── DELETE tests ─────────────────────────────────────────────────────────────

describe('DELETE /api/site/[siteId]/page', () => {
  it('returns 400 CANNOT_DELETE_HOME when slug is "/"', async () => {
    const req = makeDeleteRequest({ slug: '/' });
    const res = await DELETE(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.code).toBe('CANNOT_DELETE_HOME');
  });

  it('calls removePage and returns {removed: true} for a valid existing slug', async () => {
    mockRemovePage.mockResolvedValue(true);
    const req = makeDeleteRequest({ slug: '/about' });
    const res = await DELETE(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(200);

    expect(mockRemovePage).toHaveBeenCalledWith(SITE_ID, '/about');

    const json = (await res.json()) as Record<string, unknown>;
    expect(json.removed).toBe(true);
  });

  it('returns {removed: false} when slug is unknown', async () => {
    mockRemovePage.mockResolvedValue(false);
    const req = makeDeleteRequest({ slug: '/nonexistent' });
    const res = await DELETE(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.removed).toBe(false);
  });

  it('returns 400 when body is missing slug', async () => {
    const req = makeDeleteRequest({});
    const res = await DELETE(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
  });

  it('does NOT call archive methods (Rule 6 — artifacts are never deleted)', async () => {
    const req = makeDeleteRequest({ slug: '/about' });
    await DELETE(req, { params: FAKE_PARAMS });
    // mockArchiveSave and mockArchiveRead should not be called
    expect(mockArchiveSave).not.toHaveBeenCalled();
    expect(mockArchiveRead).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid slug and does NOT call removePage', async () => {
    // Slugs without a leading slash are invalid per isValidSlug
    const req = makeDeleteRequest({ slug: 'no-leading-slash' });
    const res = await DELETE(req, { params: FAKE_PARAMS });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(String(json.error)).toMatch(/slug/i);
    expect(mockRemovePage).not.toHaveBeenCalled();
  });
});
