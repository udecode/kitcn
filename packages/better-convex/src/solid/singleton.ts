import type { QueryClient } from '@tanstack/solid-query';
import type { ConvexClient } from 'convex/browser';

import type { DataTransformerOptions } from '../crpc/transformer';
import type { AuthStore } from '../react/auth-store';
import { ConvexQueryClient } from '../react/client';

const globalStore = globalThis as any;

type QueryClientFactory = () => QueryClient;

/** Get/create QueryClient singleton (fresh on SSR, singleton on client) */
export const getQueryClientSingleton = (
  factory: QueryClientFactory,
  symbolKey = 'convex.queryClient'
): QueryClient => {
  const key = Symbol.for(symbolKey);
  if (typeof window === 'undefined') return factory();
  if (!globalStore[key]) globalStore[key] = factory();
  return globalStore[key] as QueryClient;
};

export type ConvexQueryClientSingletonOptions = {
  authStore?: AuthStore;
  convex: ConvexClient;
  queryClient: QueryClient;
  symbolKey?: string;
  /**
   * Delay in ms before unsubscribing when a query has no observers.
   * @default 3000
   */
  unsubscribeDelay?: number;
  /** Optional payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;
};

/** Get/create ConvexQueryClient singleton (fresh on SSR, singleton on client) */
export const getConvexQueryClientSingleton = ({
  authStore,
  convex,
  queryClient,
  symbolKey = 'convex.convexQueryClient',
  unsubscribeDelay,
  transformer,
}: ConvexQueryClientSingletonOptions): ConvexQueryClient => {
  const key = Symbol.for(symbolKey);
  const isServer = typeof window === 'undefined';

  let client: ConvexQueryClient;

  if (isServer) {
    client = new ConvexQueryClient(convex as any, {
      authStore,
      unsubscribeDelay,
      transformer,
    });
  } else {
    if (globalStore[key]) {
      (globalStore[key] as ConvexQueryClient).updateAuthStore(authStore);
    } else {
      globalStore[key] = new ConvexQueryClient(convex as any, {
        authStore,
        unsubscribeDelay,
        transformer,
      });
    }
    client = globalStore[key] as ConvexQueryClient;
    client.connect(queryClient as any);
  }

  const currentOpts = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...currentOpts,
    queries: {
      ...currentOpts.queries,
      queryFn: client.queryFn(),
      queryKeyHashFn: client.hashFn(),
    },
  });

  return client;
};
