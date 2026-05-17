import { z } from 'zod';

const ServerEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  FB_ARCHIVE_BACKEND: z.enum(['fs', 'supabase']).default('fs'),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function readServerEnv(): ServerEnv {
  return ServerEnvSchema.parse(process.env);
}
