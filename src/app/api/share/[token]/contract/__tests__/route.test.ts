/**
 * Tests for GET /api/share/[token]/contract
 *
 * PUBLIC (Rule 4). Tests cover:
 *   - Invalid token shape → 404 AND zero store/deriveContract contact (Rule 4 zero-contact)
 *   - Bad / missing ?file= → 400
 *   - Share not found → 404
 *   - Revoked share → 410 Gone
 *   - No landing page in snapshot → 404
 *   - Happy path: all three file types with X-Robots-Tag: noindex
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { ShareRecord } from '@/lib/shares/share-store';
import type { SiteRecord } from '@/lib/sites/site-store';
import type { StoredContract } from '@/lib/contract/types';

// ─── Mocks (declared before subject import) ───────────────────────────────────

// vi.mock is hoisted to the top of the file by Vitest; any variables used
// inside the factory must also be hoisted via vi.hoisted() to avoid
// "Cannot access before initialization" errors.
const { mockFindByToken, mockGetSite, mockDeriveContract } = vi.hoisted(() => ({
  mockFindByToken: vi.fn(),
  mockGetSite: vi.fn(),
  mockDeriveContract: vi.fn(),
}));

vi.mock('@/lib/shares/share-store-factory', () => ({
  defaultShareStore: vi.fn(() => ({
    findByToken: mockFindByToken,
    create: vi.fn(),
    list: vi.fn(),
    rename: vi.fn(),
    revoke: vi.fn(),
    trackViewIfNotRecent: vi.fn(),
  })),
  _resetShareStoreCacheForTests: vi.fn(),
}));

vi.mock('@/lib/sites/site-store-factory', () => ({
  defaultSiteStore: vi.fn(() => ({
    getSite: mockGetSite,
    listPages: vi.fn(),
    createSite: vi.fn(),
    addPage: vi.fn(),
    removePage: vi.fn(),
    setPageArtifact: vi.fn(),
  })),
  _resetSiteStoreCacheForTests: vi.fn(),
}));

vi.mock('@/lib/contract/derive', () => ({
  deriveContract: mockDeriveContract,
}));

// ─── Subject import AFTER mocks ───────────────────────────────────────────────

import { GET } from '../route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'ABCDEFGHabcdefgh'; // 16 alphanumeric chars — valid shape

const FAKE_SITE: SiteRecord = {
  id: 'site-xyz987abc123',
  name: 'SmokeYard Studio',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const FAKE_SHARE: ShareRecord = {
  token: VALID_TOKEN,
  siteId: 'site-xyz987abc123',
  pages: [
    {
      slug: '/',
      title: 'Home',
      artifactId: 'artifact-landing-001',
      position: 0,
    },
    {
      slug: '/about',
      title: 'About',
      artifactId: 'artifact-about-002',
      position: 1,
    },
  ],
  artifactId: 'artifact-landing-001',
  name: 'Share Name',
  revokedAt: null,
  lastViewedAt: null,
  viewCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const FAKE_CONTRACT: StoredContract = {
  tokens: {
    colors: [],
    fonts: [],
    typeScale: [],
    spacing: [],
    other: [],
    meta: { extractedFrom: 'artifact-landing-001', recipeSummary: '', fallback: false },
  },
  contractMd: '# SmokeYard Studio\n\nDesign contract content.',
  tokensJson: '{"colors":[],"fonts":[]}',
  tokensCss: ':root { --color-brand: #ff0000; }',
  modelId: 'claude-haiku-4-5',
  cost: 0.001,
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(token: string, fileParam?: string): NextRequest {
  const url = fileParam
    ? `http://localhost/api/share/${token}/contract?file=${encodeURIComponent(fileParam)}`
    : `http://localhost/api/share/${token}/contract`;
  return new NextRequest(url, { method: 'GET' });
}

function withParams(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFindByToken.mockReset().mockResolvedValue(FAKE_SHARE);
  mockGetSite.mockReset().mockResolvedValue(FAKE_SITE);
  mockDeriveContract.mockReset().mockResolvedValue(FAKE_CONTRACT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/share/[token]/contract — Rule 4 zero-contact enforcement', () => {
  it('returns 404 for a too-short token WITHOUT calling findByToken or deriveContract', async () => {
    const res = await GET(makeRequest('tooshort', 'contract.md'), withParams('tooshort'));
    expect(res.status).toBe(404);
    expect(mockFindByToken).not.toHaveBeenCalled();
    expect(mockDeriveContract).not.toHaveBeenCalled();
  });

  it('returns 404 for a token with invalid chars WITHOUT calling stores', async () => {
    const badToken = 'A'.repeat(15) + '-';
    const res = await GET(makeRequest(badToken, 'contract.md'), withParams(badToken));
    expect(res.status).toBe(404);
    expect(mockFindByToken).not.toHaveBeenCalled();
    expect(mockDeriveContract).not.toHaveBeenCalled();
  });

  it('returns 404 for an empty token WITHOUT calling stores', async () => {
    const res = await GET(makeRequest('', 'contract.md'), withParams(''));
    expect(res.status).toBe(404);
    expect(mockFindByToken).not.toHaveBeenCalled();
    expect(mockDeriveContract).not.toHaveBeenCalled();
  });

  it('returns 404 for a 17-char token (too long) WITHOUT calling stores', async () => {
    const longToken = 'A'.repeat(17);
    const res = await GET(makeRequest(longToken, 'contract.md'), withParams(longToken));
    expect(res.status).toBe(404);
    expect(mockFindByToken).not.toHaveBeenCalled();
    expect(mockDeriveContract).not.toHaveBeenCalled();
  });

  it('includes the error envelope shape on Rule 4 rejection', async () => {
    const res = await GET(makeRequest('bad', 'contract.md'), withParams('bad'));
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: { code: expect.any(String), message: expect.any(String) },
    });
  });
});

describe('GET /api/share/[token]/contract — ?file= validation', () => {
  it('returns 400 when ?file= is missing', async () => {
    const res = await GET(makeRequest(VALID_TOKEN), withParams(VALID_TOKEN));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: { code: 'INVALID', message: 'invalid file param' },
    });
  });

  it('returns 400 when ?file= is unrecognized', async () => {
    const res = await GET(makeRequest(VALID_TOKEN, 'tokens.yaml'), withParams(VALID_TOKEN));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      error: { code: 'INVALID', message: 'invalid file param' },
    });
  });
});

describe('GET /api/share/[token]/contract — share resolution', () => {
  it('returns 404 when share is not found', async () => {
    mockFindByToken.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(res.status).toBe(404);
  });

  it('returns 410 Gone when share is revoked', async () => {
    mockFindByToken.mockResolvedValue({
      ...FAKE_SHARE,
      revokedAt: '2026-01-02T00:00:00.000Z',
    });
    const res = await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toMatch(/revoked/i);
  });

  it('returns 404 when the share snapshot has no "/" landing page', async () => {
    mockFindByToken.mockResolvedValue({
      ...FAKE_SHARE,
      pages: [{ slug: '/about', title: 'About', artifactId: 'art-2', position: 1 }],
    });
    const res = await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/landing/i);
  });

  it('returns 404 when share has an empty pages array', async () => {
    mockFindByToken.mockResolvedValue({ ...FAKE_SHARE, pages: [] });
    const res = await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/share/[token]/contract — happy path', () => {
  it('serves contract.md with X-Robots-Tag: noindex', async () => {
    const res = await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body).toBe(FAKE_CONTRACT.contractMd);
  });

  it('serves tokens.json with correct Content-Type', async () => {
    const res = await GET(makeRequest(VALID_TOKEN, 'tokens.json'), withParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    const body = await res.text();
    expect(body).toBe(FAKE_CONTRACT.tokensJson);
  });

  it('serves tokens.css with correct Content-Type', async () => {
    const res = await GET(makeRequest(VALID_TOKEN, 'tokens.css'), withParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    const body = await res.text();
    expect(body).toBe(FAKE_CONTRACT.tokensCss);
  });

  it('includes Content-Disposition with sanitized site name', async () => {
    const res = await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="smokeyard-studio-contract.md"',
    );
  });

  it('calls deriveContract with landing artifactId and site name', async () => {
    await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(mockDeriveContract).toHaveBeenCalledWith('artifact-landing-001', 'SmokeYard Studio');
  });

  it('falls back to "site" as name when getSite returns null', async () => {
    mockGetSite.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_TOKEN, 'tokens.json'), withParams(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="site-tokens.json"');
    expect(mockDeriveContract).toHaveBeenCalledWith('artifact-landing-001', 'site');
  });
});

describe('GET /api/share/[token]/contract — header-injection regression (public route)', () => {
  it('sanitizes CRLF and quotes in site name — no raw \\r/\\n/" in Content-Disposition', async () => {
    // Regression guard: a hostile or corrupted site name must NOT inject header
    // control characters into the Content-Disposition value on the public route.
    mockGetSite.mockResolvedValue({
      ...FAKE_SITE,
      name: 'evil"\r\nSet-Cookie: x=1',
    });
    const res = await GET(makeRequest(VALID_TOKEN, 'contract.md'), withParams(VALID_TOKEN));
    expect(res.status).toBe(200);

    const disposition = res.headers.get('Content-Disposition') ?? '';

    // The header must contain no raw CR, LF, or double-quote chars originating
    // from the site name.
    expect(disposition).not.toMatch(/\r/);
    expect(disposition).not.toMatch(/\n/);
    // The filename segment must be the sanitized form of the hostile name.
    expect(disposition).toBe('attachment; filename="evil-set-cookie-x-1-contract.md"');
  });
});
