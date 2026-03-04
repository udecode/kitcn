/**
 * CRPC Context and Provider for SolidJS
 *
 * Provides Solid context for the CRPC proxy, similar to tRPC's createTRPCContext.
 */

import type { QueryClient } from '@tanstack/solid-query';
import { QueryClientProvider } from '@tanstack/solid-query';
import type { ConvexClient } from 'convex/browser';
import type { FlowProps } from 'solid-js';
import { createContext, useContext } from 'solid-js';
import type { DataTransformerOptions } from '../crpc/transformer';
import type { FnMeta, Meta, VanillaCRPCClient } from '../crpc/types';
import type { ConvexQueryClient } from '../react/client';
import { buildMetaIndex } from '../shared/meta-utils';
import { createCRPCOptionsProxy } from './proxy';
import type { SolidCRPCClient } from './types';
import { createVanillaCRPCProxy } from './vanilla-client';

// ============================================================================
// ConvexQueryClient Context
// ============================================================================

const ConvexQueryClientContext = createContext<ConvexQueryClient | null>(null);

/** Access ConvexQueryClient (e.g., for logout cleanup) */
export const useConvexQueryClient = () => useContext(ConvexQueryClientContext);

// ============================================================================
// Meta Context
// ============================================================================

const MetaContext = createContext<Meta | undefined>(undefined);

/**
 * Access the meta object from context.
 * Returns undefined if meta was not provided to createCRPCContext.
 */
export function useMeta(): Meta | undefined {
  return useContext(MetaContext);
}

/**
 * Get auth type for a function from meta.
 */
export function useFnMeta(): (
  namespace: string,
  fnName: string
) => FnMeta | undefined {
  const meta = useMeta();
  return (namespace: string, fnName: string) => meta?.[namespace]?.[fnName];
}

// ============================================================================
// Context Factory
// ============================================================================

export type CreateCRPCContextOptions<TApi> = {
  api: TApi;
  /** Optional payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;
};

/**
 * Create CRPC context, provider, and hooks for a Convex API (SolidJS).
 *
 * @param options - Configuration object containing api
 * @returns Object with CRPCProvider, useCRPC, and useCRPCClient
 *
 * @example
 * ```tsx
 * // lib/crpc.ts
 * import { api } from '@convex/api';
 * import { createCRPCContext } from 'better-convex/solid';
 *
 * export const { useCRPC } = createCRPCContext({ api });
 *
 * // components/user-profile.tsx
 * function UserProfile(props: { id: string }) {
 *   const crpc = useCRPC();
 *   const user = createQuery(() => crpc.user.get.queryOptions({ id: props.id }));
 * }
 * ```
 */
export function createCRPCContext<TApi extends Record<string, unknown>>(
  options: CreateCRPCContextOptions<TApi>
) {
  const { api } = options;
  const meta = buildMetaIndex(api);

  const CRPCProxyContext = createContext<SolidCRPCClient<TApi> | null>(null);
  const VanillaClientContext = createContext<VanillaCRPCClient<TApi> | null>(
    null
  );

  type CRPCProviderProps = FlowProps<{
    convexClient: ConvexClient;
    convexQueryClient: ConvexQueryClient;
    queryClient: QueryClient;
  }>;

  /**
   * Provider component that wraps the app with CRPC context.
   * IMPORTANT: Never destructure props in Solid components.
   */
  function CRPCProvider(props: CRPCProviderProps) {
    const proxy = createCRPCOptionsProxy(api, meta, options.transformer);
    const vanillaClient = createVanillaCRPCProxy(
      api,
      meta,
      props.convexClient,
      options.transformer
    );

    return QueryClientProvider({
      client: props.queryClient,
      get children() {
        return ConvexQueryClientContext.Provider({
          value: props.convexQueryClient,
          get children() {
            return MetaContext.Provider({
              value: meta,
              get children() {
                return VanillaClientContext.Provider({
                  value: vanillaClient,
                  get children() {
                    return CRPCProxyContext.Provider({
                      value: proxy,
                      get children() {
                        return props.children;
                      },
                    });
                  },
                });
              },
            });
          },
        });
      },
    });
  }

  /**
   * Access the CRPC proxy for building query/mutation options.
   *
   * @returns The typed CRPC proxy
   * @throws If used outside of CRPCProvider
   *
   * @example
   * ```tsx
   * const crpc = useCRPC();
   * const user = createQuery(() => crpc.user.get.queryOptions({ id: props.id }));
   * ```
   */
  function useCRPC(): SolidCRPCClient<TApi> {
    const ctx = useContext(CRPCProxyContext);

    if (!ctx) {
      throw new Error('useCRPC must be used within CRPCProvider');
    }

    return ctx;
  }

  /**
   * Access the vanilla CRPC client for direct procedural calls.
   *
   * @returns The typed VanillaCRPCClient for direct .query()/.mutate() calls
   * @throws If used outside of CRPCProvider
   *
   * @example
   * ```tsx
   * const client = useCRPCClient();
   * const user = await client.user.get.query({ id });
   * await client.user.update.mutate({ id, name: 'test' });
   * ```
   */
  function useCRPCClient(): VanillaCRPCClient<TApi> {
    const ctx = useContext(VanillaClientContext);

    if (!ctx) {
      throw new Error('useCRPCClient must be used within CRPCProvider');
    }

    return ctx;
  }

  return {
    CRPCProvider,
    useCRPC,
    useCRPCClient,
  };
}
