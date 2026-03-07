## 8. Framework-Specific Setup

## 8.A Next.js App Router

### 8.A.1 Server caller + auth utilities

**Create:** `src/lib/convex/server.ts`

```ts
import { api } from "@convex/api";
import { convexBetterAuth } from "better-convex/auth/nextjs";

export const { createContext, createCaller, handler } = convexBetterAuth({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
```

### 8.A.2 Auth API route

**Create:** `src/app/api/auth/[...all]/route.ts`

```ts
import { handler } from "@/lib/convex/server";

export const { GET, POST } = handler;
```

### 8.A.3 RSC helpers

**Create:** `src/lib/convex/rsc.tsx`

```tsx
import "server-only";

import { api } from "@convex/api";
import type { FetchQueryOptions } from "@tanstack/react-query";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import {
  createServerCRPCProxy,
  getServerQueryClientOptions,
} from "better-convex/rsc";
import { headers } from "next/headers";
import { cache } from "react";

import { hydrationConfig } from "./query-client";
import { createCaller, createContext } from "./server";

const createRSCContext = cache(async () =>
  createContext({ headers: await headers() })
);

export const caller = createCaller(createRSCContext);
export const crpc = createServerCRPCProxy({ api });

function createServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      ...hydrationConfig,
      ...getServerQueryClientOptions({
        getToken: caller.getToken,
        convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
      }),
    },
  });
}

export const getQueryClient = cache(createServerQueryClient);

export function prefetch<T extends { queryKey: readonly unknown[] }>(
  queryOptions: T
): void {
  void getQueryClient().prefetchQuery(queryOptions);
}

export function preloadQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends readonly unknown[] = readonly unknown[],
>(
  options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): Promise<TData> {
  return getQueryClient().fetchQuery(options);
}

export function HydrateClient({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
  );
}
```

### 8.A.4 Pass server token to provider

```tsx
// app/(app)/layout.tsx
import { BetterConvexProvider } from "@/lib/convex/convex-provider";
import { caller } from "@/lib/convex/rsc";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await caller.getToken();
  return <BetterConvexProvider token={token}>{children}</BetterConvexProvider>;
}
```
