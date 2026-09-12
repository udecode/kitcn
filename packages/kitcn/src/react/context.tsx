'use client';

/**
 * CRPC Context and Provider
 *
 * Provides React context for the CRPC proxy, similar to tRPC's createTRPCContext.
 */

import type { ConvexReactClient } from 'convex/react';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { HttpClientError } from '../crpc/http-types';
import type { DataTransformerOptions } from '../crpc/transformer';
import type { FnMeta, Meta } from '../crpc/types';
import { decodeJwtIdentity } from '../internal/jwt';
import type { CRPCHttpRouter, HttpRouterRecord } from '../server/http-router';
import { buildMetaIndex } from '../shared/meta-utils';
import {
  decodeJwtExp,
  useAuthStore,
  useAuthValue,
  useFetchAccessToken,
} from './auth-store';
import type { ConvexQueryClient } from './client';
import type { CRPCClient, VanillaCRPCClient } from './crpc-types';
import {
  createHttpProxy,
  type HttpCRPCClientFromRouter,
  type VanillaHttpCRPCClientFromRouter,
} from './http-proxy';
import { createCRPCOptionsProxy } from './proxy';
import { createVanillaCRPCProxy } from './vanilla-client';

// ============================================================================
// ConvexQueryClient Context
// ============================================================================

const ConvexQueryClientContext = createContext<ConvexQueryClient | null>(null);

/** Access ConvexQueryClient (e.g., for logout cleanup) */
export const useConvexQueryClient = () => useContext(ConvexQueryClientContext);

// ============================================================================
// Meta Context (shared across all CRPC instances)
// ============================================================================

const MetaContext = createContext<Meta | undefined>(undefined);

/**
 * Hook to access the meta object from context.
 * Returns undefined if meta was not provided to createCRPCContext.
 */
export function useMeta(): Meta | undefined {
  return useContext(MetaContext);
}

/**
 * Hook to get auth type for a function from meta.
 */
export function useFnMeta(): (
  namespace: string,
  fnName: string
) => FnMeta | undefined {
  const meta = useMeta();

  return (namespace: string, fnName: string) => meta?.[namespace]?.[fnName];
}

/**
 * Stable signature of the current auth identity.
 *
 * JWTs collapse to their non-volatile claims so a refresh is a no-op; anything
 * that is not a JWT keeps its own signature so opaque-token transitions and
 * logout still register.
 */
function resolveAuthIdentity(token: string | null): string | null {
  if (token === null) {
    return null;
  }

  return decodeJwtIdentity(token) ?? `opaque:${token}`;
}

// ============================================================================
// Context Factory
// ============================================================================

// ============================================================================
// HTTP Options
// ============================================================================

/** Headers record that allows empty objects and optional properties */
type HeadersInput = { [key: string]: string | undefined };

export type CRPCHttpOptions = {
  /** Base URL for the Convex HTTP API (e.g., https://your-site.convex.site) */
  convexSiteUrl: string;
  /** Default headers or async function returning headers (for auth tokens) */
  headers?: HeadersInput | (() => HeadersInput | Promise<HeadersInput>);
  /** Custom fetch function (defaults to global fetch) */
  fetch?: typeof fetch;
  /** Error handler called on HTTP errors */
  onError?: (error: HttpClientError) => void;
};

export type CreateCRPCContextOptions<TApi> = {
  api: TApi;
  /** Optional payload transformer (always composed with built-in Date support). */
  transformer?: DataTransformerOptions;
} & Partial<CRPCHttpOptions>;

/**
 * Extract HTTP router from TApi['http'] if present (optional).
 * Uses NonNullable to handle optional http property.
 */
type ExtractHttpRouter<TApi> = TApi extends { http?: infer R }
  ? NonNullable<R> extends CRPCHttpRouter<HttpRouterRecord>
    ? NonNullable<R>
    : undefined
  : undefined;

/**
 * Create CRPC context, provider, and hooks for a Convex API.
 *
 * @param options - Configuration object containing api and optional HTTP settings
 * @returns Object with CRPCProvider, useCRPC, and useCRPCClient
 *
 * @example
 * ```tsx
 * // lib/crpc.ts
 * import { api } from '@convex/api';
 * import { createCRPCContext } from 'kitcn/react';
 *
 * // Works for both regular Convex functions and generated HTTP router types
 * export const { useCRPC } = createCRPCContext({
 *   api,
 *   convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
 * });
 *
 * // components/user-profile.tsx
 * function UserProfile({ id }) {
 *   const crpc = useCRPC();
 *   const { data } = useQuery(crpc.user.get.queryOptions({ id }));
 *
 *   // HTTP endpoints (if configured)
 *   const { data: httpData } = useQuery(crpc.http.todos.get.queryOptions({ id }));
 * }
 * ```
 */
export function createCRPCContext<TApi extends Record<string, unknown>>(
  options: CreateCRPCContextOptions<TApi>
) {
  type THttpRouter = ExtractHttpRouter<TApi>;

  const { api, ...httpOptions } = options;
  const meta = buildMetaIndex(api);
  // Create contexts
  const CRPCProxyContext = createContext<CRPCClient<TApi> | null>(null);
  const VanillaClientContext = createContext<VanillaCRPCClient<TApi> | null>(
    null
  );

  // Combined return type - use Omit to prevent type conflicts
  type CRPCWithHttp =
    THttpRouter extends CRPCHttpRouter<HttpRouterRecord>
      ? CRPCClient<Omit<TApi, 'http'>> & {
          http: HttpCRPCClientFromRouter<THttpRouter>;
        }
      : CRPCClient<TApi>;

  // Vanilla client type with http namespace (vanilla methods only, no React Query)
  type VanillaClientWithHttp =
    THttpRouter extends CRPCHttpRouter<HttpRouterRecord>
      ? VanillaCRPCClient<Omit<TApi, 'http'>> & {
          http: VanillaHttpCRPCClientFromRouter<THttpRouter>;
        }
      : VanillaCRPCClient<TApi>;

  /** Inner provider */
  function CRPCProviderInner({
    children,
    convexClient,
    convexQueryClient,
  }: {
    children: ReactNode;
    convexClient: ConvexReactClient;
    convexQueryClient: ConvexQueryClient;
  }) {
    const authStore = useAuthStore();
    const token = useAuthValue('token');
    const isAuthenticated = useAuthValue('isAuthenticated');
    const previousAuthRef = useRef<{
      identity: string | null;
      isAuthenticated: boolean;
    } | null>(null);
    // Get fetchAccessToken from context (immediately available, no race condition)
    const fetchAccessToken = useFetchAccessToken();

    useEffect(() => {
      const previous = previousAuthRef.current;
      const tokenReady = token === null || decodeJwtExp(token) !== null;
      // Compare identity claims, not the raw token. Convex proactively rotates
      // the access token every ~15 minutes and kitcn stamps a fresh `iat` into
      // each mint, so a string comparison treats routine rotation as an auth
      // transition and wipes + re-subscribes every auth-bound query. The
      // backend already re-runs the live query set under the refreshed identity
      // via `Authenticate`, so a same-claims rotation needs zero client work.
      // Non-JWT strings (the opaque SSR session token) keep their own signature
      // so the opaque -> JWT and opaque -> logout transitions still reset.
      const identity = resolveAuthIdentity(token);
      previousAuthRef.current = { identity, isAuthenticated };

      if (!previous) {
        return;
      }

      // Convex initially reports false while confirming the token supplied by
      // SSR, so false -> true for the same identity preserves hydrated data.
      // Once accepted, true -> false means Convex rejected the existing token
      // and its auth-bound cache must be cleared even if the token is retained.
      const tokenRejected = previous.isAuthenticated && !isAuthenticated;
      if ((tokenReady && previous.identity !== identity) || tokenRejected) {
        void convexQueryClient.resetAuthQueries();
      }
    }, [convexQueryClient, isAuthenticated, token]);

    // Create HTTP proxy inside component with authStore access
    const httpProxy = useMemo(() => {
      if (!httpOptions.convexSiteUrl || !meta._http) return;

      return createHttpProxy<NonNullable<THttpRouter>>({
        convexSiteUrl: httpOptions.convexSiteUrl,
        routes: meta._http,
        headers: async () => {
          // Use authStore.get() for non-reactive access
          const token = authStore.get('token');
          const expiresAt = authStore.get('expiresAt');

          // Check cache (60s leeway)
          // eslint-disable-next-line react-hooks/purity -- called in async callback, not during render
          const now = Date.now();
          const timeRemaining = expiresAt ? expiresAt - now : 0;

          if (token && expiresAt && timeRemaining >= 60_000) {
            const userHeaders =
              typeof httpOptions.headers === 'function'
                ? await httpOptions.headers()
                : httpOptions.headers;
            return { ...userHeaders, Authorization: `Bearer ${token}` };
          }

          // Use fetchAccessToken from context (available immediately, no race condition)
          if (fetchAccessToken) {
            const newToken = await fetchAccessToken({
              forceRefreshToken: !!expiresAt,
            });
            if (newToken) {
              const userHeaders =
                typeof httpOptions.headers === 'function'
                  ? await httpOptions.headers()
                  : httpOptions.headers;
              return { ...userHeaders, Authorization: `Bearer ${newToken}` };
            }
          }

          // No auth - return user headers only
          const userHeaders =
            typeof httpOptions.headers === 'function'
              ? await httpOptions.headers()
              : httpOptions.headers;
          return { ...userHeaders };
        },
        fetch: httpOptions.fetch,
        onError: httpOptions.onError,
        transformer: options.transformer,
      });
    }, [authStore, fetchAccessToken]);

    // Memoize the proxy to prevent recreation on every render
    const proxy = useMemo(
      () => createCRPCOptionsProxy(api, meta, options.transformer),
      []
    );

    // Create vanilla client proxy for direct procedural calls
    const vanillaClient = useMemo(
      () =>
        createVanillaCRPCProxy(api, meta, convexClient, options.transformer),
      [convexClient]
    );

    // Merge the http namespace here, where every input is already memoized, so
    // useCRPC/useCRPCClient collapse to plain context reads and return a stable
    // identity. A Proxy can't be spread, so it has to be wrapped.
    const mergedProxy = useMemo(() => {
      if (!httpProxy) return proxy;

      return new Proxy(proxy, {
        get(target, prop) {
          if (prop === 'http') return httpProxy;
          return Reflect.get(target, prop);
        },
      });
    }, [httpProxy, proxy]);

    const mergedClient = useMemo(() => {
      if (!httpProxy) return vanillaClient;

      return new Proxy(vanillaClient, {
        get(target, prop) {
          if (prop === 'http') return httpProxy;
          return Reflect.get(target, prop);
        },
      });
    }, [httpProxy, vanillaClient]);

    return (
      <ConvexQueryClientContext.Provider value={convexQueryClient}>
        <MetaContext.Provider value={meta}>
          <VanillaClientContext.Provider value={mergedClient}>
            <CRPCProxyContext.Provider value={mergedProxy}>
              {children}
            </CRPCProxyContext.Provider>
          </VanillaClientContext.Provider>
        </MetaContext.Provider>
      </ConvexQueryClientContext.Provider>
    );
  }

  /**
   * Provider component that wraps the app with CRPC context.
   * For auth, wrap with ConvexAuthProvider (or AuthProvider) above this.
   */
  function CRPCProvider({
    children,
    convexClient,
    convexQueryClient,
  }: {
    children: ReactNode;
    convexClient: ConvexReactClient;
    convexQueryClient: ConvexQueryClient;
  }) {
    return (
      <CRPCProviderInner
        convexClient={convexClient}
        convexQueryClient={convexQueryClient}
      >
        {children}
      </CRPCProviderInner>
    );
  }

  /**
   * Hook to access the CRPC proxy for building query/mutation options.
   *
   * @returns The typed CRPC proxy (with http namespace if configured)
   * @throws If used outside of CRPCProvider
   *
   * @example
   * ```tsx
   * const crpc = useCRPC();
   * const { data } = useQuery(crpc.user.get.queryOptions({ id }));
   *
   * // HTTP endpoints (if configured)
   * const { data: httpData } = useQuery(crpc.http.todos.get.queryOptions({ id }));
   * ```
   */
  function useCRPC(): CRPCWithHttp {
    const ctx = useContext(CRPCProxyContext);

    if (!ctx) {
      throw new Error('useCRPC must be used within CRPCProvider');
    }

    return ctx as CRPCWithHttp;
  }

  /**
   * Hook to access the vanilla CRPC client for direct procedural calls.
   *
   * @returns The typed VanillaCRPCClient for direct .query()/.mutate() calls
   * @throws If used outside of CRPCProvider
   *
   * @example
   * ```tsx
   * const client = useCRPCClient();
   *
   * // Direct calls (no React Query)
   * const user = await client.user.get.query({ id });
   * await client.user.update.mutate({ id, name: 'test' });
   *
   * // HTTP endpoints (if configured)
   * const todos = await client.http.todos.list.queryOptions({});
   * ```
   */
  function useCRPCClient(): VanillaClientWithHttp {
    const ctx = useContext(VanillaClientContext);

    if (!ctx) {
      throw new Error('useCRPCClient must be used within CRPCProvider');
    }

    return ctx as VanillaClientWithHttp;
  }

  return {
    CRPCProvider,
    useCRPC,
    useCRPCClient,
  };
}
