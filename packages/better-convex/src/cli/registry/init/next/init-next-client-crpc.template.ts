export const INIT_NEXT_CLIENT_CRPC_TEMPLATE = `import { api } from '@convex/api';
import { createCRPCContext } from 'better-convex/react';

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
`;
