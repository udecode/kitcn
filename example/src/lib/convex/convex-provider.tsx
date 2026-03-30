'use client';

import { QueryClientProvider as TanstackQueryClientProvider } from '@tanstack/react-query';
import { ConvexAuthProvider } from 'kitcn/auth/client';
import {
  ConvexReactClient,
  getConvexQueryClientSingleton,
  getQueryClientSingleton,
  useAuthStore,
} from 'kitcn/react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { env } from '@/env';
import { authClient } from '@/lib/convex/auth-client';
import { CRPCProvider } from '@/lib/convex/crpc';
import { createQueryClient } from '@/lib/convex/query-client';

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export function AppConvexProvider({
  children,
  token,
}: {
  children: ReactNode;
  token?: string;
}) {
  const router = useRouter();

  return (
    <ConvexAuthProvider
      authClient={authClient}
      client={convex}
      initialToken={token}
      onMutationUnauthorized={() => {
        router.push('/login');
      }}
      onQueryUnauthorized={({ queryName }) => {
        if (process.env.NODE_ENV === 'development') {
          toast.error(`${queryName} requires authentication`);
        } else {
          router.push('/login');
        }
      }}
    >
      <QueryClientProvider>{children}</QueryClientProvider>
    </ConvexAuthProvider>
  );
}

function QueryClientProvider({ children }: { children: ReactNode }) {
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
