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
app owns request timing. Keep the default server factory and headers-first
context. Add this helper after `caller` in the RSC module:

```ts
import { getSessionCookie } from 'better-auth/cookies';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { cache } from 'react';

export const getToken = cache(async () => {
  const heads = await headers();
  if (getSessionCookie(heads) === null) {
    return undefined;
  }
  await connection();
  return caller.getToken();
});
```

Match custom session-cookie settings in `getSessionCookie`. Use this same
`getToken` in the provider/route gate and `getServerQueryClientOptions({
getToken, convexSiteUrl })`, not `caller.getToken`. The session check skips
signed-out requests. A session without a JWT cookie still waits before fetching.
Put token-dependent components under `Suspense`.

If a TanStack integration holds Next development validation aborts pending,
apply that app-owned policy around this `connection()` await before token
retrieval. The snippet does not suppress aborts. Do not suppress ordinary auth
or network failures, or classify every `AbortError` as a Next render abort.
Recording a rejected query can itself read `Date.now()`.

`jwtCache.now` controls the expiry comparison, not the complete token operation.
A read already gated by `connection()` does not need an extra clock hook. A
separately configured request-time clock can await it:

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
refresh, missing/malformed cookies, and absent expiry bypass the hook and fetch
a token. A decoded expired JWT with `exp` calls the clock, then fetches.
`auth.expirationToleranceSeconds` remains a sibling option (default 60).
Clock throws/rejections propagate unchanged; `NaN` and infinities are rejected.

Keep `await headers()` in the RSC context creator. Put request-time token reads
under `Suspense`, including a provider or route gate that awaits `caller.getToken()`.
For `'use cache: private'`, use a separate factory with the default or a sync
clock; **never call `connection()` inside private cache**. Do not use the
request-time `getToken` helper in private cache. A private token helper
can use `cacheLife({ stale: 30 })`, read headers, create that context, and return
`context.token`. A token-blocking layout must defer its token-dependent subtree
with `Suspense`, including when awaiting a private-cache helper. Private caching
allows the clock read but does not make runtime auth data static.

`auth: { jwtCache: false }` avoids the cookie expiry clock but fetches a token
on every context creation. Kitcn does not import Next, detect render stages, or
suppress render aborts. Handling aborts only inside `jwtCache.now` leaves the
token-fetch paths that bypass the clock uncovered.

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
