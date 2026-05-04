import { z } from 'zod';

// Notion accepts both 32-char hex and dashed-UUID forms for IDs. Validate
// either, then normalize to un-dashed so downstream consumers see one format.
const NotionId = z
  .string()
  .regex(
    /^([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i,
    'must be a 32-char hex ID or dashed UUID',
  )
  .transform((s) => s.replace(/-/g, ''));

const EnvSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-/, 'ANTHROPIC_API_KEY must start with sk-ant-'),
    NOTION_API_KEY: z
      .string()
      .regex(/^(secret_|ntn_)/, 'NOTION_API_KEY must start with secret_ or ntn_'),
    NOTION_DATA_SOURCE_AESTHETICS: NotionId,
    NOTION_DATA_SOURCE_LAYOUTS: NotionId,
    NOTION_DATA_SOURCE_INTERACTIONS: NotionId,
    NOTION_DATA_SOURCE_SYSTEMS: NotionId,
    OPENROUTER_API_KEY: z.string().regex(/^sk-or-/, 'OPENROUTER_API_KEY must start with sk-or-'),
    ADMIN_SECRET: z.string().min(16),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    DAILY_COST_ALERT_USD: z.coerce.number().default(50),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    VERCEL: z.string().optional(),
  })
  .refine(
    (env) =>
      !env.VERCEL ||
      (typeof env.BLOB_READ_WRITE_TOKEN === 'string' && env.BLOB_READ_WRITE_TOKEN.length > 0),
    {
      message: 'BLOB_READ_WRITE_TOKEN is required when VERCEL is set',
      path: ['BLOB_READ_WRITE_TOKEN'],
    },
  );

// Skip during `next build` (NEXT_PHASE) and explicit opt-out (CI/Docker).
// Routes evaluate at module load during build; env access only happens at
// request time, so build-time validation would crash valid module code.
const skipValidation =
  process.env.SKIP_ENV_VALIDATION === '1' || process.env.NEXT_PHASE === 'phase-production-build';

const parsed = EnvSchema.safeParse(process.env);

if (!skipValidation && !parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment variables:\n${issues}`);
}

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = parsed.success ? parsed.data : ({} as Env);
