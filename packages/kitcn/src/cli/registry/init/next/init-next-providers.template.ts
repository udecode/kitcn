export const INIT_NEXT_PROVIDERS_TEMPLATE = `import type { ReactNode } from 'react';

import { AppConvexProvider } from '@/lib/convex/convex-provider';
import { HydrateClient } from '@/lib/convex/rsc';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppConvexProvider>
      <HydrateClient>{children}</HydrateClient>
    </AppConvexProvider>
  );
}
`;
