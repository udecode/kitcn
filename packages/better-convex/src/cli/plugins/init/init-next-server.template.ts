export const INIT_NEXT_SERVER_TEMPLATE = `import { api } from '@convex/api';
import { createCallerFactory } from 'better-convex/server';

export const { createContext, createCaller } = createCallerFactory({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
`;
