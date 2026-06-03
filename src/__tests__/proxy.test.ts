/**
 * Tests for proxy.ts — focused on the SHARE_CONTRACT_RE carve-out.
 *
 * The proxy gates everything non-public behind the fb_admin cookie in prod.
 * /api/share/[token]/contract must be public (recipients have no admin cookie)
 * while all other /api/share/* paths must remain gated:
 *   - GET /api/share            (list all shares — operator only)
 *   - PATCH /api/share/[token]  (rename — operator only)
 *   - DELETE /api/share/[token] (revoke — operator only)
 *
 * We simulate production mode (NODE_ENV=production) and verify redirect vs
 * pass-through behavior, since the proxy only enforces the gate in prod.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Fixture — short enough to dodge the generic >=16-char secret scanner pattern.
const FAKE_ADMIN = 'adm-test';

function makeRequest(pathname: string, withCookie = false): NextRequest {
  const url = `https://example.com${pathname}`;
  const req = new NextRequest(url);
  if (withCookie) {
    req.cookies.set('fb_admin', FAKE_ADMIN);
  }
  return req;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function importProxy() {
  // Reset the module between tests so env stubs take effect.
  vi.resetModules();
  const mod = await import('../proxy');
  return mod.proxy;
}

describe('proxy — SHARE_CONTRACT_RE public carve-out', () => {
  it('passes /api/share/<token>/contract through WITHOUT requiring auth cookie in prod', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    const res = proxy(makeRequest('/api/share/ABCDEFGHabcdefgh/contract'));
    // Should not be a redirect to /admin — NextResponse.next() has no location header
    expect(res.headers.get('location')).toBeNull();
  });

  it('still passes /api/share/<token>/contract with auth cookie (operator can also download)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    const res = proxy(makeRequest('/api/share/ABCDEFGHabcdefgh/contract', true));
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('proxy — /api/share/* operator endpoints remain GATED', () => {
  it('redirects GET /api/share (list) to /admin without cookie in prod', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    const res = proxy(makeRequest('/api/share'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');
  });

  it('redirects /api/share/<token> (rename/revoke path) to /admin without cookie in prod', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    // Token-level path has no /contract suffix — operator-only rename/delete
    const res = proxy(makeRequest('/api/share/ABCDEFGHabcdefgh'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');
  });

  it('redirects /api/share/<token>/ (trailing slash, no /contract) to /admin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    const res = proxy(makeRequest('/api/share/ABCDEFGHabcdefgh/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');
  });

  it('redirects /api/share/<token>/something-else to /admin (only /contract is public)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    const res = proxy(makeRequest('/api/share/ABCDEFGHabcdefgh/something-else'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');
  });
});

describe('proxy — existing public paths still work', () => {
  it('passes /s/token through without auth in prod', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    const res = proxy(makeRequest('/s/sometoken'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes / through without auth in prod', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_SECRET', FAKE_ADMIN);
    const proxy = await importProxy();

    const res = proxy(makeRequest('/'));
    expect(res.headers.get('location')).toBeNull();
  });
});
