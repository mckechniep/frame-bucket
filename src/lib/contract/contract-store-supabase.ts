import type { ContractStore } from './contract-store';
import type { StoredContract, DesignTokens } from './types';
import { supabaseServer } from '@/lib/supabase/client-server';
import type { Database } from '@/lib/supabase/database.types';

type ContractRow = Database['public']['Tables']['contracts']['Row'];

/**
 * Supabase-backed ContractStore.
 *
 * Schema note — the `contracts` table has these columns:
 *   artifact_id TEXT PK, tokens JSONB, contract_md TEXT, tokens_css TEXT,
 *   model_id TEXT, cost NUMERIC, created_at TIMESTAMPTZ
 *
 * There is NO `tokens_json` column. To store StoredContract losslessly we use
 * the `tokens` JSONB column to hold a wrapper object:
 *   { designTokens: DesignTokens, tokensJson: string }
 *
 * On read, `designTokens` is extracted as `tokens` and `tokensJson` is
 * extracted verbatim — preserving the exact rendered output from assemble.ts
 * without re-running the renderer (which would risk divergence over time).
 */

interface TokensJsonbPayload {
  designTokens: DesignTokens;
  tokensJson: string;
}

function rowToStoredContract(row: ContractRow): StoredContract {
  const payload = row.tokens as unknown as TokensJsonbPayload;
  return {
    tokens: payload.designTokens,
    tokensJson: payload.tokensJson,
    contractMd: row.contract_md,
    tokensCss: row.tokens_css,
    modelId: row.model_id ?? '',
    cost: row.cost ?? 0,
    createdAt: row.created_at,
  };
}

export class SupabaseContractStore implements ContractStore {
  async get(artifactId: string): Promise<StoredContract | null> {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('contracts')
      .select('*')
      .eq('artifact_id', artifactId)
      .maybeSingle();

    if (error) throw new Error(`SupabaseContractStore.get: ${error.message}`);
    return data ? rowToStoredContract(data) : null;
  }

  async put(artifactId: string, contract: StoredContract): Promise<void> {
    const sb = supabaseServer();
    const payload: TokensJsonbPayload = {
      designTokens: contract.tokens,
      tokensJson: contract.tokensJson,
    };

    const { error } = await sb.from('contracts').upsert(
      {
        artifact_id: artifactId,
        tokens: payload as unknown as Database['public']['Tables']['contracts']['Insert']['tokens'],
        contract_md: contract.contractMd,
        tokens_css: contract.tokensCss,
        model_id: contract.modelId,
        cost: contract.cost,
        created_at: contract.createdAt,
      },
      { onConflict: 'artifact_id' },
    );

    if (error) throw new Error(`SupabaseContractStore.put: ${error.message}`);
  }
}
