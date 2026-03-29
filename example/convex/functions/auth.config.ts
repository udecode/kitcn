import type { AuthConfig } from 'convex/server';
import { getAuthConfigProvider } from 'kitcn/auth/config';
import { getEnv } from '../lib/get-env';

export default {
  providers: [
    getEnv().JWKS
      ? getAuthConfigProvider({ jwks: getEnv().JWKS })
      : getAuthConfigProvider(),
  ],
} satisfies AuthConfig;
