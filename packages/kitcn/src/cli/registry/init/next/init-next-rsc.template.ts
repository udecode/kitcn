export const INIT_NEXT_RSC_TEMPLATE = `import 'server-only';

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
} from 'kitcn/rsc';
import { headers } from 'next/headers';
import { cache } from 'react';

import { hydrationConfig } from '@/lib/convex/query-client';
import { createCaller, createContext } from '@/lib/convex/server';

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
`;
