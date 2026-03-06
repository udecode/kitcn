/** @jsxImportSource solid-js */

/**
 * CRPC Context and Provider
 *
 * Provides Solid context for the CRPC proxy, similar to tRPC's createTRPCContext.
 */

import type { ConvexClient } from 'convex/browser';
import { createContext, type JSX, useContext } from 'solid-js';
import type { DataTransformerOptions } from '../crpc/transformer';
import { buildMetaIndex } from '../shared/meta-utils';
import { MetaContext } from './auth';
import type { ConvexQueryClient } from './client';
import type { CRPCClient, VanillaCRPCClient } from './crpc-types';
import { createCRPCOptionsProxy } from './proxy';
import { createVanillaCRPCProxy } from './vanilla-client';

// ============================================================================
// ConvexQueryClient Context
// ============================================================================

const ConvexQueryClientContext = createContext<ConvexQueryClient | null>(null);

/** Access ConvexQueryClient (e.g., for logout cleanup) */
export const useConvexQueryClient = () => useContext(ConvexQueryClientContext);

// ============================================================================
// Context Factory
// ============================================================================

export type CreateCRPCContextOptions<TApi> = {
  api: TApi;
  /** Optional payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;
};

/**
 * Create CRPC context, provider, and hooks for a Convex API.
 *
 * @param options - Configuration object containing api and optional transformer
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
 * function UserProfile({ id }) {
 *   const crpc = useCRPC();
 *   const { data } = useQuery(crpc.user.get.queryOptions({ id }));
 * }
 * ```
 */
export function createCRPCContext<TApi extends Record<string, unknown>>(
  options: CreateCRPCContextOptions<TApi>
) {
  const { api } = options;
  const meta = buildMetaIndex(api);

  const CRPCProxyContext = createContext<CRPCClient<TApi> | null>(null);
  const VanillaClientContext = createContext<VanillaCRPCClient<TApi> | null>(
    null
  );

  function CRPCProvider(props: {
    children: JSX.Element;
    convexClient: ConvexClient;
    convexQueryClient: ConvexQueryClient;
  }) {
    // No useMemo needed — Solid doesn't re-render
    const proxy = createCRPCOptionsProxy(api, meta, options.transformer);
    const vanillaClient = createVanillaCRPCProxy(
      api,
      meta,
      props.convexClient,
      options.transformer
    );

    return (
      <ConvexQueryClientContext.Provider value={props.convexQueryClient}>
        <MetaContext.Provider value={meta}>
          <VanillaClientContext.Provider value={vanillaClient}>
            <CRPCProxyContext.Provider value={proxy}>
              {props.children}
            </CRPCProxyContext.Provider>
          </VanillaClientContext.Provider>
        </MetaContext.Provider>
      </ConvexQueryClientContext.Provider>
    );
  }

  function useCRPC(): CRPCClient<TApi> {
    const ctx = useContext(CRPCProxyContext);
    if (!ctx) throw new Error('useCRPC must be used within CRPCProvider');
    return ctx;
  }

  function useCRPCClient(): VanillaCRPCClient<TApi> {
    const ctx = useContext(VanillaClientContext);
    if (!ctx) throw new Error('useCRPCClient must be used within CRPCProvider');
    return ctx;
  }

  return { CRPCProvider, useCRPC, useCRPCClient };
}
