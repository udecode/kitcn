import type { ReactNode } from 'react';
import { caller, crpc, prefetch } from '@/lib/convex/rsc';
import { ClientProviders } from './client-providers';

export async function Providers({ children }: { children: ReactNode }) {
  const token = await caller.getToken();

  prefetch(crpc.user.getCurrentUser.queryOptions());

  return <ClientProviders token={token}>{children}</ClientProviders>;
}
