'use client';

import { useSyncExternalStore } from 'react';

import { useWizardStore } from '@/lib/wizard/store';

/**
 * True once Zustand's persist middleware has rehydrated the wizard store from
 * localStorage on the client.
 *
 * The store is configured with `skipHydration: true`, so SSR and the first
 * client render both observe the empty initial state; rehydration only happens
 * after `WizardHydrator` calls `persist.rehydrate()` in a post-mount effect.
 *
 * `useSyncExternalStore`'s server snapshot returns `false`, guaranteeing that
 * SSR and the first client render agree. Components can therefore gate any
 * store-derived markup (attributes like `disabled`, conditional class names)
 * on this flag to avoid hydration mismatches, then re-render with the real
 * persisted values once it flips to `true`.
 */
export function useWizardHydrated(): boolean {
  return useSyncExternalStore(
    (callback) => useWizardStore.persist.onFinishHydration(callback),
    () => useWizardStore.persist.hasHydrated(),
    () => false,
  );
}
