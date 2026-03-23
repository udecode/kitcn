export const AUTH_NEXT_SERVER_TEMPLATE = `import { api } from '@convex/api';
import { convexBetterAuth } from 'better-convex/auth/nextjs';

export const { createContext, createCaller, handler } = convexBetterAuth({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
`;
