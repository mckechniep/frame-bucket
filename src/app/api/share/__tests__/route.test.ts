import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from '../route';
import { _resetShareStoreCacheForTests } from '@/lib/shares/share-store-factory';

// Mock the site-store factory so we control getSite / listPages.
vi.mock('@/lib/sites/site-store-factory', () => ({
  defaultSiteStore: vi.fn(),
}));

// Mock the supabase client so the share store's transitive imports don't
// try to read real env. The default share store falls back to MemoryShareStore
// when FB_SHARE_BACKEND is unset, so we don't need to fully mock it.
vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(() => ({})),
}));

import { defaultSiteStore } from '@/lib/sites/site-store-factory';

const siteStoreMock = defaultSiteStore as ReturnType<typeof vi.fn>;

/** Returns a minimal SiteRecord shape. */
function makeSite(id = 'site-1') {
  return {
    id,
    name: 'Test Site',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Returns a minimal SitePage array (one landing page). */
function makePages(siteId = 'site-1') {
  return [
    {
      siteId,
      slug: '/',
      title: 'Home',
      artifactId: 'art-001',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

function siteReturns(site: ReturnType<typeof makeSite> | null, pages = makePages()): void {
  siteStoreMock.mockReturnValue({
    getSite: vi.fn(async () => site),
    listPages: vi.fn(async () => pages),
    createSite: vi.fn(),
    addPage: vi.fn(),
    removePage: vi.fn(),
    setPageArtifact: vi.fn(),
  });
}

function makePostRequest(body: unknown, opts: { raw?: string } = {}): NextRequest {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.raw ?? JSON.stringify(body),
  };
  return new NextRequest('http://localhost/api/share', init);
}

beforeEach(() => {
  _resetShareStoreCacheForTests();
  // Default: site exists with one landing page
  siteReturns(makeSite());
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('POST /api/share', () => {
  it('returns 400 INVALID when body is not JSON', async () => {
    const req = makePostRequest({}, { raw: 'not json{' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('INVALID');
  });

  it('returns 400 INVALID when siteId is missing', async () => {
    const req = makePostRequest({ name: 'A' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID');
  });

  it('returns 400 INVALID when name is empty', async () => {
    const req = makePostRequest({ siteId: 'site-1', name: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 INVALID when name exceeds 120 chars', async () => {
    const req = makePostRequest({ siteId: 'site-1', name: 'A'.repeat(121) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 INVALID when name is only whitespace (post-trim empty)', async () => {
    // Regression guard: if .trim() runs AFTER .min(1) in the Zod chain,
    // "   " would pass validation and store as "". Schema must reject.
    const req = makePostRequest({ siteId: 'site-1', name: '   ' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID');
  });

  it('returns 404 NOT_FOUND when site does not exist', async () => {
    siteReturns(null);
    const req = makePostRequest({ siteId: 'missing', name: 'Share' });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 EMPTY_SITE when site has no pages', async () => {
    siteReturns(makeSite(), []);
    const req = makePostRequest({ siteId: 'site-1', name: 'Share' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('EMPTY_SITE');
  });

  it('returns 200 with token, url, name, createdAt, pageCount on success', async () => {
    const req = makePostRequest({ siteId: 'site-1', name: 'My Share' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(json.url).toMatch(/^http:\/\/localhost:3000\/s\/[A-Za-z0-9]{16}$/);
    expect(json.name).toBe('My Share');
    expect(typeof json.createdAt).toBe('string');
    expect(json.pageCount).toBe(1);
  });

  it('uses NEXT_PUBLIC_APP_URL when building the share URL', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://frame-bucket.vercel.app';
    const req = makePostRequest({ siteId: 'site-1', name: 'X' });
    const res = await POST(req);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/frame-bucket\.vercel\.app\/s\/[A-Za-z0-9]{16}$/);
  });

  it('falls back to http://localhost:3000 when NEXT_PUBLIC_APP_URL is unset', async () => {
    const req = makePostRequest({ siteId: 'site-1', name: 'X' });
    const res = await POST(req);
    expect((await res.json()).url).toMatch(/^http:\/\/localhost:3000\//);
  });

  it('trims whitespace from name (Zod .trim())', async () => {
    const req = makePostRequest({ siteId: 'site-1', name: '   spaced   ' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('spaced');
  });

  it('pageCount reflects the number of pages in the site snapshot', async () => {
    siteReturns(makeSite(), [
      ...makePages(),
      {
        siteId: 'site-1',
        slug: '/about',
        title: 'About',
        artifactId: 'art-002',
        position: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const req = makePostRequest({ siteId: 'site-1', name: 'Multi-page' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).pageCount).toBe(2);
  });
});

describe('GET /api/share', () => {
  it('returns { shares: [] } when no shares exist', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shares).toEqual([]);
  });

  it('returns shares created via POST, newest first', async () => {
    // Create two via POST with a small delay to ensure different createdAt
    const res1 = await POST(makePostRequest({ siteId: 'site-1', name: 'first' }));
    const first = (await res1.json()).token;

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));

    const res2 = await POST(makePostRequest({ siteId: 'site-1', name: 'second' }));
    const second = (await res2.json()).token;

    const res = await GET();
    const json = await res.json();
    expect(json.shares).toHaveLength(2);
    // Newest first
    expect(json.shares[0].token).toBe(second);
    expect(json.shares[1].token).toBe(first);
    expect(json.shares[0].name).toBe('second');
    expect(json.shares[1].name).toBe('first');
  });
});
