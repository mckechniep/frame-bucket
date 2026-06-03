import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

vi.mock('@/lib/generation/archive', () => ({
  defaultArchiveStore: vi.fn(),
}));

import { defaultArchiveStore } from '@/lib/generation/archive';

const storeMock = defaultArchiveStore as ReturnType<typeof vi.fn>;

let readSpy: ReturnType<typeof vi.fn>;

function setupStore(behavior: { read?: (id: string) => unknown } = {}): void {
  readSpy = vi.fn(behavior.read ?? (() => null));
  storeMock.mockReturnValue({ read: readSpy });
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/artifact/abc123/html', { method: 'GET' });
}

function withParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  setupStore();
});

describe('GET /api/artifact/[id]/html — happy path', () => {
  it('returns 200 with the artifact html and correct content-type', async () => {
    const sampleHtml = '<html><body>Hello world</body></html>';
    setupStore({
      read: () => ({
        html: sampleHtml,
        recipeSummary: 'test',
        modelId: 'x',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        generatedAt: '2024-01-01',
        iterationRound: 0,
      }),
    });

    const res = await GET(makeGetRequest(), withParams('abc123'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toBe(sampleHtml);
  });

  it('calls store.read with the provided id', async () => {
    const html = '<html></html>';
    setupStore({
      read: () => ({
        html,
        recipeSummary: '',
        modelId: '',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        generatedAt: '',
        iterationRound: 0,
      }),
    });

    await GET(makeGetRequest(), withParams('specific-id-42'));

    expect(readSpy).toHaveBeenCalledWith('specific-id-42');
  });
});

describe('GET /api/artifact/[id]/html — not found', () => {
  it('returns 404 when store.read returns null', async () => {
    setupStore({ read: () => null });

    const res = await GET(makeGetRequest(), withParams('nonexistent'));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

describe('GET /api/artifact/[id]/html — bad request', () => {
  it('returns 400 when id is an empty string', async () => {
    const res = await GET(makeGetRequest(), withParams(''));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    // store should not be called for empty id
    expect(readSpy).not.toHaveBeenCalled();
  });
});
