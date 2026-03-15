export const INIT_REACT_CLIENT_CRPC_TEMPLATE = `import { api } from '@convex/api';
import { createCRPCContext } from 'better-convex/react';

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL!,
});
`;
