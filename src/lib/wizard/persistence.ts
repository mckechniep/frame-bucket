import { createJSONStorage } from 'zustand/middleware';

export const WIZARD_PERSIST_VERSION = 2;

export const WIZARD_PERSIST_KEY = `frame-bucket-wizard@${WIZARD_PERSIST_VERSION}` as const;

export function createWizardStorage() {
  return createJSONStorage(() => {
    if (typeof window === 'undefined') {
      return undefined as unknown as Storage;
    }
    return window.localStorage;
  });
}
