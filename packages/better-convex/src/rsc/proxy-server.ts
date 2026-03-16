/**
 * Server-compatible CRPC Proxy for RSC
 *
 * Provides a proxy that works in React Server Components.
 * Query execution is delegated to getServerQueryClientOptions.
 */

import { type FunctionReference, getFunctionName } from 'convex/server';

import { convexInfiniteQueryOptions, convexQuery } from '../crpc/query-options';
import type { Meta } from '../crpc/types';
import type { CRPCClient, InfiniteQueryOptsParam } from '../react/crpc-types';
import type { HttpCRPCClientFromRouter } from '../react/http-proxy';
import type { CRPCHttpRouter, HttpRouterRecord } from '../server/http-router';
import {
  buildMetaIndex,
  getFuncRef,
  getFunctionMeta,
} from '../shared/meta-utils';
import { buildHttpQueryOptions } from './http-server';

export type CreateServerCRPCProxyOptions<TApi> = {
  api: TApi;
};

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
 * Combined CRPC client type with optional HTTP router.
 * HTTP router is extracted from TApi['http'] if present.
 * Uses Omit to prevent type conflicts between CRPCClient and HttpCRPCClient.
 */
export type ServerCRPCClient<TApi extends Record<string, unknown>> =
  ExtractHttpRouter<TApi> extends CRPCHttpRouter<HttpRouterRecord>
    ? CRPCClient<Omit<TApi, 'http'>> & {
        http: HttpCRPCClientFromRouter<ExtractHttpRouter<TApi>>;
      }
    : CRPCClient<TApi>;

function createRecursiveProxy(
  api: Record<string, unknown>,
  path: string[],
  meta: Meta
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;

      // HTTP namespace detection: crpc.http.*.queryOptions()
      if (path[0] === 'http' && prop === 'queryOptions') {
        const routeKey = path.slice(1).join('.');
        const route = meta._http?.[routeKey];
        if (!route) {
          throw new Error(`HTTP route not found: ${routeKey}`);
        }

        return (args: unknown = {}) =>
          buildHttpQueryOptions(route, routeKey, args);
      }

      if (prop === 'queryOptions') {
        return (args: unknown = {}, opts?: { skipUnauth?: boolean }) => {
          const funcRef = getFuncRef(api, path);
          // Use convexQuery (non-hook) for RSC compatibility
          return convexQuery(
            funcRef as FunctionReference<'query'>,
            args as Record<string, unknown>,
            meta,
            opts
          );
        };
      }

      // Terminal method: infiniteQueryOptions (for paginated queries)
      if (prop === 'infiniteQueryOptions') {
        return (
          args: Record<string, unknown> = {},
          opts: InfiniteQueryOptsParam = {}
        ) => {
          const funcRef = getFuncRef(api, path) as FunctionReference<'query'>;
          return convexInfiniteQueryOptions(funcRef, args, opts, meta);
        };
      }

      // Terminal method: infiniteQueryKey (for paginated queries)
      if (prop === 'infiniteQueryKey') {
        return (args?: Record<string, unknown>) => {
          const funcRef = getFuncRef(api, path);
          const funcName = getFunctionName(funcRef);
          return ['convexQuery', funcName, args ?? {}];
        };
      }

      // Terminal property: meta (function metadata)
      if (prop === 'meta' && path.length >= 2) {
        return getFunctionMeta(path, meta);
      }

      return createRecursiveProxy(api, [...path, prop], meta);
    },
  });
}

/**
 * Create a server-compatible CRPC proxy for RSC.
 * Only supports queryOptions (no mutations in RSC).
 *
 * Query execution (including auth) is handled by getServerQueryClientOptions.
 *
 * @example
 * ```tsx
 * // src/lib/convex/rsc.tsx
 * import { api } from '@convex/api';
 *
 * // Proxy just builds query options - no auth config here
 * export const crpc = createServerCRPCProxy({ api });
 *
 * // Auth + execution config in QueryClient
 * const queryClient = new QueryClient({
 *   defaultOptions: getServerQueryClientOptions({
 *     getToken: caller.getToken,
 *     convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
 *   }),
 * });
 *
 * // app/page.tsx (RSC)
 * prefetch(crpc.posts.list.queryOptions());
 * prefetch(crpc.http.health.queryOptions({}));
 * ```
 */
export function createServerCRPCProxy<TApi extends Record<string, unknown>>(
  options: CreateServerCRPCProxyOptions<TApi>
): ServerCRPCClient<TApi> {
  const { api } = options;
  const meta = buildMetaIndex(api);
  return createRecursiveProxy(api, [], meta) as ServerCRPCClient<TApi>;
}
