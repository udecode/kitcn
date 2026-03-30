import { api } from '@convex/api';
import { createCRPCContext } from 'kitcn/react';
import { env } from '@/env';

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
});
