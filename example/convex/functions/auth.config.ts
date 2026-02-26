import { getAuthConfigProvider } from 'better-convex/auth/config';
import type { AuthConfig } from 'convex/server';
import { getEnv } from '../lib/get-env';

export default {
  providers: [getAuthConfigProvider({ jwks: getEnv().JWKS })],
} satisfies AuthConfig;
