/** @jsxImportSource solid-js */

/**
 * CRPC Context and Provider
 *
 * Provides Solid context for the CRPC proxy, similar to tRPC's createTRPCContext.
 */

import type { ConvexClient } from 'convex/browser';
import { createContext, type JSX, useContext } from 'solid-js';
import type { HttpClientError } from '../crpc/http-types';
import type { DataTransformerOptions } from '../crpc/transformer';
import type { CRPCHttpRouter, HttpRouterRecord } from '../server/http-router';
import { buildMetaIndex } from '../shared/meta-utils';
import { MetaContext } from './auth';
import { useAuthStore, useFetchAccessToken } from './auth-store';
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

// ============================================================================
// Context Factory
// ============================================================================

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
 * import { createCRPCContext } from 'better-convex/solid';
 *
 * // Works for both regular Convex functions and generated HTTP router types
 * export const { useCRPC } = createCRPCContext({
 *   api,
 *   convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
 * });
 *
 * // components/user-profile.tsx
 * function UserProfile({ id }) {
 *   const crpc = useCRPC();
 *   const { data } = createQuery(() => crpc.user.get.queryOptions({ id }));
 *
 *   // HTTP endpoints (if configured)
 *   const { data: httpData } = createQuery(() => crpc.http.todos.get.queryOptions({ id }));
 * }
 * ```
 */
export function createCRPCContext<TApi extends Record<string, unknown>>(
  options: CreateCRPCContextOptions<TApi>
) {
  type THttpRouter = ExtractHttpRouter<TApi>;

  const { api, ...httpOptions } = options;
  const meta = buildMetaIndex(api);

  const CRPCProxyContext = createContext<CRPCClient<TApi> | null>(null);
  const VanillaClientContext = createContext<VanillaCRPCClient<TApi> | null>(
    null
  );
  const HttpProxyContext = createContext<
    HttpCRPCClientFromRouter<NonNullable<THttpRouter>> | undefined
  >(undefined);

  // Combined return type - use Omit to prevent type conflicts
  type CRPCWithHttp =
    THttpRouter extends CRPCHttpRouter<HttpRouterRecord>
      ? CRPCClient<Omit<TApi, 'http'>> & {
          http: HttpCRPCClientFromRouter<THttpRouter>;
        }
      : CRPCClient<TApi>;

  // Vanilla client type with http namespace (vanilla methods only, no Solid Query)
  type VanillaClientWithHttp =
    THttpRouter extends CRPCHttpRouter<HttpRouterRecord>
      ? VanillaCRPCClient<Omit<TApi, 'http'>> & {
          http: VanillaHttpCRPCClientFromRouter<THttpRouter>;
        }
      : VanillaCRPCClient<TApi>;

  function CRPCProvider(props: {
    children: JSX.Element;
    convexClient: ConvexClient;
    convexQueryClient: ConvexQueryClient;
  }) {
    const authStore = useAuthStore();
    const fetchAccessToken = useFetchAccessToken();

    // No useMemo needed — Solid component body runs once
    const proxy = createCRPCOptionsProxy(api, meta, options.transformer);
    const vanillaClient = createVanillaCRPCProxy(
      api,
      meta,
      props.convexClient,
      options.transformer
    );

    // Create HTTP proxy with auth headers callback
    const httpProxy = (() => {
      if (!httpOptions.convexSiteUrl || !meta._http) return;

      return createHttpProxy<NonNullable<THttpRouter>>({
        convexSiteUrl: httpOptions.convexSiteUrl,
        routes: meta._http,
        headers: async () => {
          const token = authStore.get('token');
          const expiresAt = authStore.get('expiresAt');

          // Check cache (60s leeway)
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
    })();

    return (
      <ConvexQueryClientContext.Provider value={props.convexQueryClient}>
        <MetaContext.Provider value={meta}>
          <VanillaClientContext.Provider value={vanillaClient}>
            <HttpProxyContext.Provider value={httpProxy}>
              <CRPCProxyContext.Provider value={proxy}>
                {props.children}
              </CRPCProxyContext.Provider>
            </HttpProxyContext.Provider>
          </VanillaClientContext.Provider>
        </MetaContext.Provider>
      </ConvexQueryClientContext.Provider>
    );
  }

  function useCRPC(): CRPCWithHttp {
    const ctx = useContext(CRPCProxyContext);
    const httpProxy = useContext(HttpProxyContext);

    if (!ctx) {
      throw new Error('useCRPC must be used within CRPCProvider');
    }

    if (httpProxy) {
      return new Proxy(ctx, {
        get(target, prop) {
          if (prop === 'http') return httpProxy;
          return Reflect.get(target, prop);
        },
      }) as CRPCWithHttp;
    }

    return ctx as CRPCWithHttp;
  }

  function useCRPCClient(): VanillaClientWithHttp {
    const ctx = useContext(VanillaClientContext);
    const httpProxy = useContext(HttpProxyContext);

    if (!ctx) {
      throw new Error('useCRPCClient must be used within CRPCProvider');
    }

    if (httpProxy) {
      return new Proxy(ctx, {
        get(target, prop) {
          if (prop === 'http') return httpProxy;
          return Reflect.get(target, prop);
        },
      }) as VanillaClientWithHttp;
    }

    return ctx as VanillaClientWithHttp;
  }

  return { CRPCProvider, useCRPC, useCRPCClient };
}
