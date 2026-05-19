import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '../route';

vi.mock('@/lib/shares/share-store-factory', () => ({
  defaultShareStore: vi.fn(),
}));

vi.mock('@/lib/supabase/client-server', () => ({
  supabaseServer: vi.fn(() => ({})),
}));

import { defaultShareStore } from '@/lib/shares/share-store-factory';

const storeMock = defaultShareStore as ReturnType<typeof vi.fn>;

let renameSpy: ReturnType<typeof vi.fn>;
let revokeSpy: ReturnType<typeof vi.fn>;

function setupStore(
  behavior: {
    rename?: (token: string, name: string) => unknown;
    revoke?: (token: string) => unknown;
  } = {},
): void {
  renameSpy = vi.fn(
    behavior.rename ??
      (() => ({
        token: 'A'.repeat(16),
        artifactId: 'art-1',
        name: 'updated',
        revokedAt: null,
        lastViewedAt: null,
        viewCount: 0,
        createdAt: new Date().toISOString(),
      })),
  );
  revokeSpy = vi.fn(
    behavior.revoke ??
      (() => ({
        token: 'A'.repeat(16),
        artifactId: 'art-1',
        name: 'name',
        revokedAt: new Date().toISOString(),
        lastViewedAt: null,
        viewCount: 0,
        createdAt: new Date().toISOString(),
      })),
  );
  storeMock.mockReturnValue({
    create: vi.fn(),
    findByToken: vi.fn(),
    list: vi.fn(),
    rename: renameSpy,
    revoke: revokeSpy,
    trackViewIfNotRecent: vi.fn(),
  });
}

function makePatchRequest(body: unknown, opts: { raw?: string } = {}): NextRequest {
  return new NextRequest('http://localhost/api/share/X', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: opts.raw ?? JSON.stringify(body),
  });
}

function makeDeleteRequest(): NextRequest {
  return new NextRequest('http://localhost/api/share/X', { method: 'DELETE' });
}

function withParams(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

const VALID = 'A'.repeat(16); // valid token shape

beforeEach(() => {
  setupStore();
});

describe('PATCH /api/share/[token] — Rule 4 enforcement', () => {
  it('returns 404 for an invalid token shape (too short) WITHOUT calling rename', async () => {
    const res = await PATCH(makePatchRequest({ name: 'x' }), withParams('tooshort'));
    expect(res.status).toBe(404);
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it('returns 404 for an invalid token shape (contains dash) WITHOUT calling rename', async () => {
    const res = await PATCH(makePatchRequest({ name: 'x' }), withParams('A'.repeat(15) + '-'));
    expect(res.status).toBe(404);
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it('returns 404 for an empty token WITHOUT calling rename', async () => {
    const res = await PATCH(makePatchRequest({ name: 'x' }), withParams(''));
    expect(res.status).toBe(404);
    expect(renameSpy).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/share/[token] — body validation', () => {
  it('returns 400 INVALID on malformed JSON', async () => {
    const res = await PATCH(makePatchRequest({}, { raw: 'not json{' }), withParams(VALID));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID');
  });

  it('returns 400 INVALID when name is missing', async () => {
    const res = await PATCH(makePatchRequest({}), withParams(VALID));
    expect(res.status).toBe(400);
  });

  it('returns 400 INVALID when name exceeds 120 chars', async () => {
    const res = await PATCH(makePatchRequest({ name: 'A'.repeat(121) }), withParams(VALID));
    expect(res.status).toBe(400);
  });

  it('returns 400 INVALID when name is only whitespace', async () => {
    const res = await PATCH(makePatchRequest({ name: '   ' }), withParams(VALID));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/share/[token] — happy path + missing share', () => {
  it('returns 404 when store.rename returns null (share missing)', async () => {
    setupStore({ rename: () => null });
    const res = await PATCH(makePatchRequest({ name: 'x' }), withParams(VALID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 200 with updated share on success', async () => {
    const res = await PATCH(makePatchRequest({ name: 'updated' }), withParams(VALID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.share.name).toBe('updated');
    expect(renameSpy).toHaveBeenCalledWith(VALID, 'updated');
  });
});

describe('DELETE /api/share/[token] — Rule 4 enforcement', () => {
  it('returns 404 for an invalid token shape WITHOUT calling revoke', async () => {
    const res = await DELETE(makeDeleteRequest(), withParams('tooshort'));
    expect(res.status).toBe(404);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it('returns 404 for an empty token WITHOUT calling revoke', async () => {
    const res = await DELETE(makeDeleteRequest(), withParams(''));
    expect(res.status).toBe(404);
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/share/[token] — happy path + missing share', () => {
  it('returns 404 when store.revoke returns null', async () => {
    setupStore({ revoke: () => null });
    const res = await DELETE(makeDeleteRequest(), withParams(VALID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 200 with revoked share on success', async () => {
    const res = await DELETE(makeDeleteRequest(), withParams(VALID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.share.revokedAt).not.toBeNull();
    expect(revokeSpy).toHaveBeenCalledWith(VALID);
  });

  it('idempotent: re-revoking a revoked share returns 200 with original timestamp', async () => {
    // The store's revoke is idempotent by contract (Task 8/9 enforce this);
    // we verify the route passes through that behavior cleanly.
    const ts = new Date().toISOString();
    setupStore({
      revoke: () => ({
        token: VALID,
        artifactId: 'art-1',
        name: 'n',
        revokedAt: ts, // already revoked; store returns existing
        lastViewedAt: null,
        viewCount: 0,
        createdAt: new Date().toISOString(),
      }),
    });
    const res = await DELETE(makeDeleteRequest(), withParams(VALID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.share.revokedAt).toBe(ts);
  });
});
