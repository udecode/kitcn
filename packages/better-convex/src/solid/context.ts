/**
 * CRPC Context and Provider (Solid.js)
 *
 * Provides Solid.js context for the CRPC proxy, similar to tRPC's createTRPCContext.
 * Uses Solid's createContext/useContext instead of React equivalents.
 *
 * Provider components use JSX internally but are typed to work with any JSX runtime.
 * Users compose these in their Solid app where the Solid JSX transform is configured.
 */

import type { ConvexClient } from 'convex/browser';
import { createContext, useContext } from 'solid-js';
import type { DataTransformerOptions } from '../crpc/transformer';
import type { FnMeta, Meta } from '../crpc/types';
import { buildMetaIndex } from '../shared/meta-utils';
import type { ConvexQueryClient } from './client';
import type { CRPCClient, VanillaCRPCClient } from './crpc-types';
import { createCRPCOptionsProxy } from './proxy';
import { createVanillaCRPCProxy } from './vanilla-client';

// ============================================================================
// ConvexQueryClient Context
// ============================================================================

export const ConvexQueryClientContext = createContext<ConvexQueryClient>();

/** Access ConvexQueryClient (e.g., for logout cleanup) */
export const useConvexQueryClient = () => useContext(ConvexQueryClientContext);

// ============================================================================
// Meta Context (shared across all CRPC instances)
// ============================================================================

export const MetaContext = createContext<Meta>();

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

export type CRPCContextValue<TApi extends Record<string, unknown>> = {
  crpc: CRPCClient<TApi>;
  client: VanillaCRPCClient<TApi>;
  convexQueryClient: ConvexQueryClient;
  meta: Meta;
};

/**
 * Create CRPC context, provider helpers, and accessors for a Convex API (Solid.js).
 *
 * Returns contexts and factory functions. Users create the JSX Provider in their Solid app.
 *
 * @example
 * ```tsx
 * // lib/crpc.ts
 * import { api } from '@convex/api';
 * import { createCRPCContext } from 'better-convex/solid';
 *
 * export const { CRPCContext, createCRPCValue, useCRPC, useCRPCClient } = createCRPCContext({ api });
 *
 * // App.tsx (in your Solid app with Solid JSX transform)
 * const value = createCRPCValue({ convexClient, convexQueryClient, authState });
 * <CRPCContext.Provider value={value}>
 *   <App />
 * </CRPCContext.Provider>
 * ```
 */
export function createCRPCContext<TApi extends Record<string, unknown>>(
  options: CreateCRPCContextOptions<TApi>
) {
  const { api } = options;
  const meta = buildMetaIndex(api);

  const CRPCContext = createContext<CRPCContextValue<TApi>>();

  /**
   * Create the value object to pass to CRPCContext.Provider.
   */
  function createCRPCValue(props: {
    convexClient: ConvexClient;
    convexQueryClient: ConvexQueryClient;
    authState?: { isAuthenticated: boolean; isLoading: boolean };
  }): CRPCContextValue<TApi> {
    const authState = props.authState ?? {
      isAuthenticated: false,
      isLoading: true,
    };

    const crpc = createCRPCOptionsProxy(api, meta, {
      authState,
      convexClient: props.convexClient,
      transformer: options.transformer,
    });

    const client = createVanillaCRPCProxy(
      api,
      meta,
      props.convexClient,
      options.transformer
    );

    return {
      crpc,
      client,
      convexQueryClient: props.convexQueryClient,
      meta,
    };
  }

  /**
   * Access the CRPC proxy for building query/mutation options.
   */
  function useCRPC(): CRPCClient<TApi> {
    const ctx = useContext(CRPCContext);
    if (!ctx)
      throw new Error('useCRPC must be used within CRPCContext.Provider');
    return ctx.crpc;
  }

  /**
   * Access the vanilla CRPC client for direct procedural calls.
   */
  function useCRPCClient(): VanillaCRPCClient<TApi> {
    const ctx = useContext(CRPCContext);
    if (!ctx)
      throw new Error('useCRPCClient must be used within CRPCContext.Provider');
    return ctx.client;
  }

  return {
    CRPCContext,
    createCRPCValue,
    useCRPC,
    useCRPCClient,
  };
}
