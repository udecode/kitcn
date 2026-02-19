import 'server-only';

import { api } from '@convex/api';
import type { FetchQueryOptions } from '@tanstack/react-query';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import {
  createServerCRPCProxy,
  getServerQueryClientOptions,
} from 'better-convex/rsc';
import { headers } from 'next/headers';
import { cache } from 'react';

import { env } from '@/env';

import { hydrationConfig } from './query-client';
import { createCaller, createContext } from './server';

// RSC context factory - wraps createContext with cache() and next/headers
const createRSCContext = cache(async () =>
  createContext({ headers: await headers() })
);

/**
 * RSC caller - lazy context creation per call.
 *
 * @example
 * ```tsx
 * const posts = await caller.posts.list();
 * ```
 */
export const caller = createCaller(createRSCContext);

// App-specific CRPC proxy for RSC (uses server-compatible proxy)
export const crpc = createServerCRPCProxy({ api });

/** Create server-side QueryClient with HTTP-based queryFn */
function createServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      ...hydrationConfig,
      ...getServerQueryClientOptions({
        getToken: caller.getToken,
        convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
      }),
    },
  });
}

/**
 * Get a stable QueryClient per request (React cache)
 */
export const getQueryClient = cache(createServerQueryClient);

/**
 * Prefetch a query on the server. Results are dehydrated via HydrateClient.
 * Fire-and-forget - returns void, does not wait for completion.
 *
 * For data on server + hydration, use:
 * `const data = await getQueryClient().fetchQuery(crpc.x.queryOptions())`
 *
 * @example
 * ```tsx
 * // RSC - prefetch for client hydration only
 * prefetch(crpc.posts.list.queryOptions());
 * return <HydrateClient><ClientComponent /></HydrateClient>;
 * ```
 */
export function prefetch<T extends { queryKey: readonly unknown[] }>(
  queryOptions: T
): void {
  void getQueryClient().prefetchQuery(queryOptions);
}

/**
 * Preload a query on the server. Returns data + hydrates for client.
 *
 * If you render the data on the server AND use it in client components,
 * they can get out of sync when the client revalidates. Prefer `prefetch` unless
 * you need server-side data access and understand this tradeoff.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 *
 * @example
 * ```tsx
 * // RSC - preload data for server rendering + hydrate for client
 * const posts = await preloadQuery(crpc.posts.list.queryOptions());
 * return <HydrateClient><PostList initialData={posts} /></HydrateClient>;
 * ```
 */
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

/**
 * Hydration wrapper for client components.
 * Dehydrates prefetched queries so client components get instant data.
 *
 * IMPORTANT: Must wrap ALL client components that use prefetched queries.
 * If a client component renders BEFORE HydrateClient and uses useQuery,
 * it will create the query in pending state, and hydration won't update it.
 *
 * @example
 * ```tsx
 * // RSC
 * prefetch(crpc.posts.list.queryOptions());
 * return (
 *   <HydrateClient>
 *     <ClientComponent />
 *   </HydrateClient>
 * );
 * ```
 */
export function HydrateClient({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
  );
}
