import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { AppConvexProvider } from '@/lib/convex/convex-provider';
import { caller, crpc, HydrateClient, prefetch } from '@/lib/convex/rsc';

export async function Providers({ children }: { children: ReactNode }) {
  const token = await caller.getToken();

  prefetch(
    crpc.user.getCurrentUser.queryOptions(undefined, { skipUnauth: true })
  );

  return (
    <AppConvexProvider token={token}>
      <HydrateClient>
        <NuqsAdapter>{children}</NuqsAdapter>
      </HydrateClient>
    </AppConvexProvider>
  );
}
