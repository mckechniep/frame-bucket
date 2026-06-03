/**
 * Tests for GET /api/site/[siteId]/contract
 *
 * Admin-gated (cookie protected by proxy in prod). Tests cover:
 *   - Bad / missing ?file= → 400
 *   - Unknown siteId → 404
 *   - Site with no landing page → 404
 *   - Happy path: all three file types with correct Content-Type,
 *     Content-Disposition (sanitized site name), and body.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SiteRecord, SitePage } from '@/lib/sites/site-store';
import type { StoredContract } from '@/lib/contract/types';

// ─── Mocks (declared before subject import) ───────────────────────────────────

// vi.mock is hoisted to the top of the file by Vitest; any variables used
// inside the factory must also be hoisted via vi.hoisted() to avoid
// "Cannot access before initialization" errors.
const { mockGetSite, mockListPages, mockDeriveContract } = vi.hoisted(() => ({
  mockGetSite: vi.fn(),
  mockListPages: vi.fn(),
  mockDeriveContract: vi.fn(),
}));

vi.mock('@/lib/sites/site-store-factory', () => ({
  defaultSiteStore: vi.fn(() => ({
    getSite: mockGetSite,
    listPages: mockListPages,
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

const SITE_ID = 'site-abc123def456';

const FAKE_SITE: SiteRecord = {
  id: SITE_ID,
  name: 'SmokeYard Studio',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LANDING_PAGE: SitePage = {
  siteId: SITE_ID,
  slug: '/',
  title: 'Home',
  artifactId: 'artifact-landing-001',
  position: 0,
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

function makeRequest(siteId: string, fileParam?: string): NextRequest {
  const url = fileParam
    ? `http://localhost/api/site/${siteId}/contract?file=${encodeURIComponent(fileParam)}`
    : `http://localhost/api/site/${siteId}/contract`;
  return new NextRequest(url, { method: 'GET' });
}

function withParams(siteId: string): { params: Promise<{ siteId: string }> } {
  return { params: Promise.resolve({ siteId }) };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetSite.mockReset().mockResolvedValue(FAKE_SITE);
  mockListPages.mockReset().mockResolvedValue([LANDING_PAGE]);
  mockDeriveContract.mockReset().mockResolvedValue(FAKE_CONTRACT);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/site/[siteId]/contract — ?file= validation', () => {
  it('returns 400 when ?file= is missing', async () => {
    const res = await GET(makeRequest(SITE_ID), withParams(SITE_ID));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid file param');
  });

  it('returns 400 when ?file= is an unrecognized value', async () => {
    const res = await GET(makeRequest(SITE_ID, 'tokens.yaml'), withParams(SITE_ID));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid file param');
  });

  it('returns 400 for an empty ?file= string', async () => {
    const res = await GET(makeRequest(SITE_ID, ''), withParams(SITE_ID));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/site/[siteId]/contract — site/page resolution', () => {
  it('returns 404 when site is not found', async () => {
    mockGetSite.mockResolvedValue(null);
    const res = await GET(makeRequest(SITE_ID, 'contract.md'), withParams(SITE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it('returns 404 when there is no landing page', async () => {
    mockListPages.mockResolvedValue([]);
    const res = await GET(makeRequest(SITE_ID, 'contract.md'), withParams(SITE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/landing/i);
  });

  it('returns 404 when pages list has no "/" slug', async () => {
    mockListPages.mockResolvedValue([{ ...LANDING_PAGE, slug: '/about' }]);
    const res = await GET(makeRequest(SITE_ID, 'contract.md'), withParams(SITE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/landing/i);
  });
});

describe('GET /api/site/[siteId]/contract — happy path', () => {
  it('serves contract.md with correct Content-Type and sanitized filename', async () => {
    const res = await GET(makeRequest(SITE_ID, 'contract.md'), withParams(SITE_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="smokeyard-studio-contract.md"',
    );
    const body = await res.text();
    expect(body).toBe(FAKE_CONTRACT.contractMd);
  });

  it('serves tokens.json with correct Content-Type and sanitized filename', async () => {
    const res = await GET(makeRequest(SITE_ID, 'tokens.json'), withParams(SITE_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="smokeyard-studio-tokens.json"',
    );
    const body = await res.text();
    expect(body).toBe(FAKE_CONTRACT.tokensJson);
  });

  it('serves tokens.css with correct Content-Type and sanitized filename', async () => {
    const res = await GET(makeRequest(SITE_ID, 'tokens.css'), withParams(SITE_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="smokeyard-studio-tokens.css"',
    );
    const body = await res.text();
    expect(body).toBe(FAKE_CONTRACT.tokensCss);
  });

  it('calls deriveContract with the landing artifactId and site name', async () => {
    await GET(makeRequest(SITE_ID, 'contract.md'), withParams(SITE_ID));
    expect(mockDeriveContract).toHaveBeenCalledWith('artifact-landing-001', 'SmokeYard Studio');
  });

  it('sanitizes a site name with special chars for the filename', async () => {
    // "My Brand! v2.0" → lowercase + collapse non-alphanumeric runs to "-"
    // "! " collapses to a single dash, "." collapses to a single dash
    // → "my-brand-v2-0"
    mockGetSite.mockResolvedValue({
      ...FAKE_SITE,
      name: 'My Brand! v2.0',
    });
    const res = await GET(makeRequest(SITE_ID, 'contract.md'), withParams(SITE_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="my-brand-v2-0-contract.md"',
    );
  });
});
