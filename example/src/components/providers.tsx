import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { BetterConvexProvider } from '@/lib/convex/convex-provider';
import { caller, crpc, HydrateClient, prefetch } from '@/lib/convex/rsc';

export async function Providers({ children }: { children: ReactNode }) {
  const token = await caller.getToken();

  prefetch(crpc.user.getCurrentUser.queryOptions());

  return (
    <BetterConvexProvider token={token}>
      <HydrateClient>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NuqsAdapter>{children}</NuqsAdapter>
        </ThemeProvider>
      </HydrateClient>
    </BetterConvexProvider>
  );
}
