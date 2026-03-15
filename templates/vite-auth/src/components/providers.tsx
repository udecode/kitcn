import type { ReactNode } from 'react';

import { BetterConvexProvider } from '@/lib/convex/convex-provider';

export function Providers({ children }: { children: ReactNode }) {
  return <BetterConvexProvider>{children}</BetterConvexProvider>;
}
