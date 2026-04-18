import { api } from '@convex/api';
import { createCRPCContext } from 'kitcn/react';

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL!,
});
