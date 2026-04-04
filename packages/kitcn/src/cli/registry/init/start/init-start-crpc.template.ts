export const INIT_START_CRPC_TEMPLATE = `import { api } from '@convex/api';
import { createCRPCContext } from 'kitcn/react';

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL!,
});
`;
