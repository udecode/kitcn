import type { ReactNode } from 'react';

import { BetterConvexProvider } from '@/lib/convex/convex-provider';
import { HydrateClient } from '@/lib/convex/rsc';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <BetterConvexProvider>
      <HydrateClient>{children}</HydrateClient>
    </BetterConvexProvider>
  );
}
