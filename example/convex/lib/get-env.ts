import { createEnv } from 'better-convex/server';
import { z } from 'zod';

// Define the environment schema
const envSchema = z.object({
  // Public environment variables
  DEPLOY_ENV: z.string().default('production'),
  SITE_URL: z.string().default('http://localhost:3000'),

  // Auth
  BETTER_AUTH_SECRET: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  JWKS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // Superadmin emails
  ADMIN: z
    .string()
    .transform((s) => (s ? s.split(',') : []))
    .pipe(z.array(z.string())),
});

export const getEnv = createEnv({
  schema: envSchema,
});
