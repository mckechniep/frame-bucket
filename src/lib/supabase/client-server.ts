import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { readServerEnv } from './env';

let cached: SupabaseClient<Database> | null = null;

export function supabaseServer(): SupabaseClient<Database> {
  if (cached) return cached;
  const env = readServerEnv();
  cached = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
