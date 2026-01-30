import type { ReactNode } from 'react';
import { caller, crpc, prefetch, HydrateClient } from '@/lib/convex/rsc';
import { ClientProviders } from './client-providers';

export async function Providers({ children }: { children: ReactNode }) {
  const token = await caller.getToken();

  prefetch(crpc.user.getCurrentUser.queryOptions());

  return (
    <ClientProviders token={token}>
      <HydrateClient>{children}</HydrateClient>
    </ClientProviders>
  );
}
