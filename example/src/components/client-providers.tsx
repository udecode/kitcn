'use client';

import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { BetterConvexProvider } from '@/lib/convex/convex-provider';

export function ClientProviders({
  token,
  children,
}: {
  token?: string;
  children: ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <BetterConvexProvider token={token}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </BetterConvexProvider>
    </ThemeProvider>
  );
}
