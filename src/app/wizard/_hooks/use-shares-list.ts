'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ShareRecord } from '@/lib/shares/share-store';

interface SharesResponse {
  shares: ShareRecord[];
}

/**
 * Fetches the full /api/share list on mount and exposes a refresh callback
 * the wizard can fire after creating a new share. Backs the "has active
 * share" indicator on iteration-history rows (Task 16).
 *
 * Fails silently — the sidebar indicator is non-critical and the canonical
 * list lives on /shares. A network blip should not break wizard navigation.
 *
 * Refetch is implemented via a tick counter rather than calling an async
 * helper from the effect body: the react-hooks/set-state-in-effect rule
 * flags synchronous calls to functions that ultimately setState, even when
 * the setState is wrapped in async/.then. The tick pattern keeps setState
 * inside a Promise callback, which the rule explicitly allows.
 */
export function useSharesList(): { shares: ShareRecord[]; refresh: () => void } {
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/share', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<SharesResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setShares(Array.isArray(data.shares) ? data.shares : []);
      })
      .catch(() => {
        /* intentionally swallowed — see fn-level docstring */
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { shares, refresh };
}
