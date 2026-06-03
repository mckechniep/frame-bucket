import type { StoredContract } from './types';

/**
 * Pluggable contract cache backend.
 * Two implementations: FsContractStore (local dev) and SupabaseContractStore (production).
 * Selected at runtime by the factory in ./contract-store-factory.ts.
 */
export interface ContractStore {
  /** Returns the cached contract for an artifact, or null if not yet cached. */
  get(artifactId: string): Promise<StoredContract | null>;
  /** Persists a contract for an artifact (upsert semantics). */
  put(artifactId: string, contract: StoredContract): Promise<void>;
}
