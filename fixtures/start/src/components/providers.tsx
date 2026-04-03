import type { ReactNode } from 'react';

import { AppConvexProvider } from '@/lib/convex/convex-provider';

export function Providers({ children }: { children: ReactNode }) {
  return <AppConvexProvider>{children}</AppConvexProvider>;
}
