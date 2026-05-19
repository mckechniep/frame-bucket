import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function supabaseBrowser(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'supabaseBrowser: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
    );
  }
  return createClient<Database>(url, anon);
}
