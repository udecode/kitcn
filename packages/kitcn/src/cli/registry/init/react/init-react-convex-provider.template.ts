export const INIT_REACT_CONVEX_PROVIDER_TEMPLATE = `'use client';

import { QueryClientProvider as TanstackQueryClientProvider } from '@tanstack/react-query';
import {
  ConvexProvider,
  ConvexReactClient,
  getConvexQueryClientSingleton,
  getQueryClientSingleton,
} from 'kitcn/react';
import type { ReactNode } from 'react';

import { CRPCProvider } from '@/lib/convex/crpc';
import { createQueryClient } from '@/lib/convex/query-client';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL!);

export function AppConvexProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexProvider client={convex}>
      <QueryProvider>{children}</QueryProvider>
    </ConvexProvider>
  );
}

function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClientSingleton(createQueryClient);
  const convexQueryClient = getConvexQueryClientSingleton({
    convex,
    queryClient,
  });

  return (
    <TanstackQueryClientProvider client={queryClient}>
      <CRPCProvider convexClient={convex} convexQueryClient={convexQueryClient}>
        {children}
      </CRPCProvider>
    </TanstackQueryClientProvider>
  );
}
`;
