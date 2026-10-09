## 8. Framework-Specific Setup

## 8.A Next.js App Router

### 8.A.1 Server caller + auth utilities

**Create:** `src/lib/convex/server.ts`

```ts
import { api } from "@convex/api";
import { convexBetterAuth } from "kitcn/auth/nextjs";

export const { createContext, createCaller, handler } = convexBetterAuth({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
```

### 8.A.2 Auth API route

**Create:** `src/app/api/auth/[...all]/route.ts`

```ts
import { handler } from "@/lib/convex/server";

export const { GET, POST, OPTIONS } = handler;
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
} from "kitcn/rsc";
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

### 8.A.4 JWT cache and partial prefetching

With Next 16 `cacheComponents` and `partialPrefetching`, the default JWT expiry
clock can trigger a Blocking Route error even after `await headers()`. The
app owns clock timing. For request-time contexts, configure the server factory:

```ts
import { connection } from 'next/server';

export const { createContext, createCaller, handler } = convexBetterAuth({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
  auth: {
    jwtCache: {
      now: async () => {
        await connection();
        return Math.floor(Date.now() / 1000);
      },
    },
  },
});
```

`auth.jwtCache` accepts a boolean or `{ now?: () => number | Promise<number> }`.
The clock returns finite **Unix seconds**, not milliseconds. The reader awaits
it only for a decoded cached JWT with an expiry. Disabled caching, forced
refresh, missing/malformed cookies, and absent expiry bypass the hook.
`auth.expirationToleranceSeconds` remains a sibling option (default 60).
Clock throws/rejections propagate unchanged; `NaN` and infinities are rejected.

Keep `await headers()` in the RSC context creator. Put request-time token reads
under `Suspense`, including a provider or route gate that awaits `caller.getToken()`.
For `'use cache: private'`, use a separate factory with the default or a sync
clock; **never call `connection()` inside private cache**. A private token helper
can use `cacheLife({ stale: 30 })`, read headers, create that context, and return
`context.token`. A token-blocking layout must defer its token-dependent subtree
with `Suspense`, including when awaiting a private-cache helper. Private caching
allows the clock read but does not make runtime auth data static.

`auth: { jwtCache: false }` avoids the cookie expiry clock but fetches a token
on every context creation. Kitcn does not import Next, detect render stages, or
suppress render aborts. An app that runs a `connection()` clock through TanStack
queries owns abort handling because recording a query failure can also read
`Date.now()`. Do not suppress ordinary auth failures.

Full examples: [Next.js JWT cache guidance](https://kitcn.dev/docs/nextjs#jwt-cache-and-partial-prefetching).

### 8.A.5 Pass server token to provider

```tsx
// app/(app)/layout.tsx
import { AppConvexProvider } from "@/lib/convex/convex-provider";
import { caller } from "@/lib/convex/rsc";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await caller.getToken();
  return <AppConvexProvider token={token}>{children}</AppConvexProvider>;
}
```
