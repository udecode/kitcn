'use client';

import { QueryClientProvider as TanstackQueryClientProvider } from '@tanstack/react-query';
import { ConvexAuthProvider } from 'kitcn/auth/client';
import {
  ConvexReactClient,
  getConvexQueryClientSingleton,
  getQueryClientSingleton,
} from 'kitcn/react';
import type { ReactNode } from 'react';

import { authClient } from '@/lib/convex/auth-client';
import { CRPCProvider } from '@/lib/convex/crpc';
import { createQueryClient } from '@/lib/convex/query-client';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL!);

export function AppConvexProvider({
  children,
  token,
}: {
  children: ReactNode;
  token?: string;
}) {
  const queryClient = getQueryClientSingleton(createQueryClient);
  const convexQueryClient = getConvexQueryClientSingleton({
    convex,
    queryClient,
  });

  return (
    <ConvexAuthProvider
      authClient={authClient}
      client={convex}
      convexQueryClient={convexQueryClient}
      initialToken={token}
    >
      <TanstackQueryClientProvider client={queryClient}>
        <CRPCProvider convexClient={convex} convexQueryClient={convexQueryClient}>
          {children}
        </CRPCProvider>
      </TanstackQueryClientProvider>
    </ConvexAuthProvider>
  );
}
