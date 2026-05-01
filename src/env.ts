import { z } from 'zod';

const EnvSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-/, 'ANTHROPIC_API_KEY must start with sk-ant-'),
    NOTION_API_KEY: z
      .string()
      .regex(/^(secret_|ntn_)/, 'NOTION_API_KEY must start with secret_ or ntn_'),
    NOTION_DATA_SOURCE_AESTHETICS: z.string().length(32),
    NOTION_DATA_SOURCE_LAYOUTS: z.string().length(32),
    NOTION_DATA_SOURCE_INTERACTIONS: z.string().length(32),
    NOTION_DATA_SOURCE_SYSTEMS: z.string().length(32),
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

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
