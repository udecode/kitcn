export const AUTH_TEMPLATE = `import { convex } from 'better-convex/auth';
import { getEnv } from '../lib/get-env';
import authConfig from './auth.config';
import { defineAuth } from './generated/auth';

export default defineAuth(() => ({
  emailAndPassword: {
    enabled: true,
  },
  baseURL: getEnv().SITE_URL,
  plugins: [
    convex({
      authConfig,
      jwks: getEnv().JWKS,
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 15,
  },
  telemetry: { enabled: false },
  trustedOrigins: [getEnv().SITE_URL],
}));
`;

export const AUTH_CONVEX_TEMPLATE = `import { convex } from 'better-convex/auth';
import authConfig from './auth.config';
import { defineAuth } from './generated/auth';

export default defineAuth(() => ({
  emailAndPassword: {
    enabled: true,
  },
  baseURL: process.env.SITE_URL!,
  plugins: [
    convex({
      authConfig,
      jwks: process.env.JWKS,
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 15,
  },
  telemetry: { enabled: false },
  trustedOrigins: [process.env.SITE_URL!],
}));
`;
