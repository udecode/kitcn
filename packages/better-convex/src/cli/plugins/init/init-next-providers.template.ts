export const INIT_NEXT_PROVIDERS_TEMPLATE = `import type { ReactNode } from 'react';

import { BetterConvexProvider } from '@/lib/convex/convex-provider';
import { HydrateClient } from '@/lib/convex/rsc';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <BetterConvexProvider>
      <HydrateClient>{children}</HydrateClient>
    </BetterConvexProvider>
  );
}
`;
