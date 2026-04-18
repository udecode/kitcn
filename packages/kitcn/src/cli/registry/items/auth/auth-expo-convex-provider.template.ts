export const AUTH_EXPO_CONVEX_PROVIDER_TEMPLATE = `import { QueryClientProvider as TanstackQueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
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

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export function AppConvexProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <ConvexAuthProvider
      authClient={authClient}
      client={convex}
      onMutationUnauthorized={() => {
        router.push('/auth');
      }}
      onQueryUnauthorized={() => {
        router.push('/auth');
      }}
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
`;
