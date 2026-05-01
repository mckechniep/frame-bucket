import type { Taxonomy } from '@/lib/types';

export interface SyncLogEntry {
  at: string;
  by: string;
  summary: string;
  added: number;
  modified: number;
  removed: number;
  renamed: number;
}

export interface TaxonomyStore {
  get(): Promise<Taxonomy | null>;
  set(taxonomy: Taxonomy): Promise<void>;
  history(limit?: number): Promise<SyncLogEntry[]>;
  appendHistory(entry: SyncLogEntry): Promise<void>;
}
