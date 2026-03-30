import { createEnv } from 'kitcn/server';
import { z } from 'zod';

const envSchema = z.object({
  DEPLOY_ENV: z.string().default('production'),
  SITE_URL: z.string().default('http://localhost:3005'),
});

export const getEnv = createEnv({
  schema: envSchema,
});
