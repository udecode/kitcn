'use client';

import { QueryClientProvider as TanstackQueryClientProvider } from '@tanstack/react-query';
import { ConvexAuthProvider } from 'kitcn/auth/client';
import {
  ConvexReactClient,
  getConvexQueryClientSingleton,
  getQueryClientSingleton,
  useAuthStore,
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
  return (
    <ConvexAuthProvider
      authClient={authClient}
      client={convex}
      initialToken={token}
    >
      <QueryProvider>{children}</QueryProvider>
    </ConvexAuthProvider>
  );
}

function QueryProvider({ children }: { children: ReactNode }) {
  const authStore = useAuthStore();
  const queryClient = getQueryClientSingleton(createQueryClient);
  const convexQueryClient = getConvexQueryClientSingleton({
    authStore,
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
