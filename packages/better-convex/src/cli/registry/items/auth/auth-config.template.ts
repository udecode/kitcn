export const AUTH_CONFIG_TEMPLATE = `import { getAuthConfigProvider } from 'better-convex/auth/config';
import type { AuthConfig } from 'convex/server';
import { getEnv } from '../lib/get-env';

export default {
  providers: [
    getEnv().JWKS
      ? getAuthConfigProvider({ jwks: getEnv().JWKS })
      : getAuthConfigProvider(),
  ],
} satisfies AuthConfig;
`;

export const AUTH_CONVEX_CONFIG_TEMPLATE = `import { getAuthConfigProvider } from 'better-convex/auth/config';
import type { AuthConfig } from 'convex/server';

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
`;
