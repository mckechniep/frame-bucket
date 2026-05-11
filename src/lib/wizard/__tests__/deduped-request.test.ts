import { afterEach, describe, expect, test, vi } from 'vitest';

import { __resetDedupedRequestCache, dedupedRequest } from '../deduped-request';

afterEach(() => {
  __resetDedupedRequestCache();
  vi.useRealTimers();
});

describe('dedupedRequest', () => {
  test('two acquires with the same key share one factory call', async () => {
    const factory = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return 'value';
    });

    const a = dedupedRequest('k1', factory);
    const b = dedupedRequest('k1', factory);

    expect(factory).toHaveBeenCalledTimes(1);
    await expect(a.promise).resolves.toBe('value');
    await expect(b.promise).resolves.toBe('value');

    a.release();
    b.release();
  });

  test('release-then-acquire within grace period does not abort the request (StrictMode case)', async () => {
    vi.useFakeTimers();

    const abortCalls: AbortSignal[] = [];
    const factory = vi.fn(async (signal: AbortSignal) => {
      abortCalls.push(signal);
      return 'ok';
    });

    const a = dedupedRequest('k2', factory);
    a.release();

    // Advance less than the grace period; abort should not fire yet.
    vi.advanceTimersByTime(100);

    // Second mount acquires before the grace timer fires.
    const b = dedupedRequest('k2', factory);

    // Now advance well past the original grace window.
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(abortCalls[0]!.aborted).toBe(false);

    b.release();
    vi.advanceTimersByTime(500);
    expect(abortCalls[0]!.aborted).toBe(true);
  });

  test('release with no acquirer aborts after grace period elapses (true navigation away)', async () => {
    vi.useFakeTimers();

    let captured: AbortSignal | null = null;
    const factory = vi.fn(async (signal: AbortSignal) => {
      captured = signal;
      return 'unused';
    });

    const a = dedupedRequest('k3', factory);
    a.release();

    expect(captured!.aborted).toBe(false);
    vi.advanceTimersByTime(199);
    expect(captured!.aborted).toBe(false);
    vi.advanceTimersByTime(2);
    expect(captured!.aborted).toBe(true);
  });

  test('settled promises evict the cache entry — next acquire starts a fresh request', async () => {
    let counter = 0;
    const factory = vi.fn(async () => {
      counter += 1;
      return counter;
    });

    const a = dedupedRequest<number>('k4', factory);
    await expect(a.promise).resolves.toBe(1);
    a.release();

    // Settled promise should evict before any second acquire reuses it.
    // Microtask flush gives finally() a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    const b = dedupedRequest<number>('k4', factory);
    await expect(b.promise).resolves.toBe(2);
    b.release();
  });

  test('different keys never share a request', async () => {
    const factory = vi.fn(async () => 'v');
    const a = dedupedRequest('key-a', factory);
    const b = dedupedRequest('key-b', factory);
    expect(factory).toHaveBeenCalledTimes(2);
    a.release();
    b.release();
  });

  test('double-release on a single handle is idempotent', async () => {
    vi.useFakeTimers();
    let captured: AbortSignal | null = null;
    const factory = vi.fn(async (signal: AbortSignal) => {
      captured = signal;
      return 'v';
    });

    const a = dedupedRequest('k5', factory);
    const b = dedupedRequest('k5', factory);

    a.release();
    a.release(); // second release on same handle should be ignored

    vi.advanceTimersByTime(500);
    expect(captured!.aborted).toBe(false);

    b.release();
    vi.advanceTimersByTime(500);
    expect(captured!.aborted).toBe(true);
  });
});
