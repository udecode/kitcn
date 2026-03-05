/**
 * CRPC Recursive Proxy (Solid.js)
 *
 * Creates a tRPC-like proxy that wraps Convex API functions with
 * TanStack Query options builders. Unlike the React version, this
 * calls plain functions instead of hooks, receiving auth state
 * and meta via a ProxyContext object.
 *
 * @example
 * ```ts
 * const crpc = createCRPCOptionsProxy(api, meta, ctx);
 * const opts = crpc.user.get.queryOptions({ id: '123' });
 * const { data } = createQuery(() => opts);
 * ```
 */

import {
  type QueryFilters,
  type SkipToken,
  skipToken,
} from '@tanstack/solid-query';
import type { FunctionArgs, FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';
import { convexAction, convexQuery } from '../crpc/query-options';
import type { DataTransformerOptions } from '../crpc/transformer';
import type { ConvexQueryHookOptions } from '../crpc/types';
import type { CallerMeta } from '../server/caller';
import {
  getFuncRef,
  getFunctionMeta,
  getFunctionType,
} from '../shared/meta-utils';
import {
  type CRPCClient,
  FUNC_REF_SYMBOL,
  type InfiniteQueryOptsParam,
} from './crpc-types';
import {
  createConvexActionMutationOptions,
  createConvexActionQueryOptions,
  createConvexInfiniteQueryOptions,
  createConvexMutationOptions,
  createConvexQueryOptions,
} from './query-options';

// ============================================================================
// Proxy Implementation
// ============================================================================

/** Get query key prefix based on function type */
function getQueryKeyPrefix(
  path: string[],
  meta: CallerMeta
): 'convexQuery' | 'convexAction' {
  if (getFunctionType(path, meta) === 'action') return 'convexAction';
  return 'convexQuery';
}

/** Context passed through the proxy for auth state and client access */
type ProxyContext = {
  meta: CallerMeta;
  authState: { isAuthenticated: boolean; isLoading: boolean };
  convexClient: {
    mutation: (funcRef: any, args: any) => Promise<any>;
    action: (funcRef: any, args: any) => Promise<any>;
  };
  transformer?: DataTransformerOptions;
};

/**
 * Create a recursive proxy that accumulates path segments.
 */
function createRecursiveProxy(
  api: Record<string, unknown>,
  path: string[],
  ctx: ProxyContext
): unknown {
  return new Proxy(
    // Use a function as target so the proxy is callable
    () => {},
    {
      get(_target, prop: string | symbol) {
        // Ignore symbols and internal properties
        if (typeof prop === 'symbol') return;
        if (prop === 'then') return; // Prevent Promise detection

        // Terminal method: queryOptions
        if (prop === 'queryOptions') {
          return (args: unknown = {}, opts?: unknown) => {
            const funcRef = getFuncRef(api, path);
            const fnType = getFunctionType(path, ctx.meta);

            // Actions use one-shot query (no subscription)
            if (fnType === 'action') {
              return createConvexActionQueryOptions(
                funcRef as FunctionReference<'action'>,
                args as Record<string, unknown>,
                {
                  meta: ctx.meta,
                  authState: ctx.authState,
                  queryOptions: opts as Parameters<
                    typeof createConvexActionQueryOptions
                  >[2],
                }
              );
            }

            return createConvexQueryOptions(
              funcRef as FunctionReference<'query'>,
              args as Record<string, unknown>,
              {
                meta: ctx.meta,
                authState: ctx.authState,
                hookOptions: opts as ConvexQueryHookOptions,
              }
            );
          };
        }

        // Terminal method: staticQueryOptions (non-hook for event handlers)
        if (prop === 'staticQueryOptions') {
          return (args: unknown = {}, opts?: { skipUnauth?: boolean }) => {
            const funcRef = getFuncRef(api, path);
            const fnType = getFunctionType(path, ctx.meta);

            // Convert skipToken to 'skip' for convexQuery/convexAction
            const finalArgs = args === skipToken ? 'skip' : args;

            // Actions use convexAction (one-shot, no subscription)
            if (fnType === 'action') {
              return convexAction(
                funcRef as FunctionReference<'action'>,
                finalArgs as FunctionArgs<FunctionReference<'action'>>,
                ctx.meta,
                opts
              );
            }

            return convexQuery(
              funcRef as FunctionReference<'query'>,
              finalArgs as FunctionArgs<FunctionReference<'query'>>,
              ctx.meta,
              opts
            );
          };
        }

        // Terminal method: queryKey
        if (prop === 'queryKey') {
          return (args: unknown = {}) => {
            const funcRef = getFuncRef(api, path);
            const funcName = getFunctionName(funcRef);
            const prefix = getQueryKeyPrefix(path, ctx.meta);
            return [prefix, funcName, args];
          };
        }

        // Terminal method: queryFilter
        if (prop === 'queryFilter') {
          return (args?: unknown, filters?: Omit<QueryFilters, 'queryKey'>) => {
            const funcRef = getFuncRef(api, path);
            const funcName = getFunctionName(funcRef);
            const prefix = getQueryKeyPrefix(path, ctx.meta);
            return {
              ...filters,
              queryKey: [prefix, funcName, args],
            };
          };
        }

        // Terminal method: infiniteQueryOptions (for paginated queries)
        if (prop === 'infiniteQueryOptions') {
          return (
            args: Record<string, unknown> | SkipToken = {},
            opts: InfiniteQueryOptsParam = {}
          ) => {
            const funcRef = getFuncRef(api, path) as FunctionReference<'query'>;
            const options = createConvexInfiniteQueryOptions(
              funcRef,
              args,
              opts,
              {
                meta: ctx.meta,
                authState: ctx.authState,
              }
            );

            // Attach funcRef via Symbol (non-enumerable, won't serialize)
            Object.defineProperty(options, FUNC_REF_SYMBOL, {
              value: funcRef,
              enumerable: false,
              configurable: false,
            });

            return options;
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
          return getFunctionMeta(path, ctx.meta);
        }

        // Terminal method: mutationKey
        if (prop === 'mutationKey') {
          return () => {
            const funcRef = getFuncRef(api, path);
            const funcName = getFunctionName(funcRef);
            return ['convexMutation', funcName];
          };
        }

        // Terminal method: mutationOptions
        if (prop === 'mutationOptions') {
          return (opts?: unknown) => {
            const funcRef = getFuncRef(api, path);
            const fnType = getFunctionType(path, ctx.meta);

            if (fnType === 'action') {
              return createConvexActionMutationOptions(
                funcRef as FunctionReference<'action'>,
                ctx.convexClient,
                {
                  meta: ctx.meta,
                  authState: ctx.authState,
                  mutationOptions: opts as Parameters<
                    typeof createConvexActionMutationOptions
                  >[2],
                  transformer: ctx.transformer,
                }
              );
            }

            return createConvexMutationOptions(
              funcRef as FunctionReference<'mutation'>,
              ctx.convexClient,
              {
                meta: ctx.meta,
                authState: ctx.authState,
                mutationOptions: opts as Parameters<
                  typeof createConvexMutationOptions
                >[2],
                transformer: ctx.transformer,
              }
            );
          };
        }

        // Continue path accumulation
        return createRecursiveProxy(api, [...path, prop], ctx);
      },
    }
  );
}

/**
 * Create a CRPC proxy for a Convex API object (Solid.js version).
 *
 * Unlike the React version which uses hooks internally, this proxy
 * receives auth state and client references via a context object,
 * since Solid components only execute once.
 *
 * @param api - The Convex API object (from `@convex/api`)
 * @param meta - Generated function metadata for runtime type detection
 * @param ctx - Proxy context with auth state, client, and transformer
 * @returns A typed proxy with queryOptions/mutationOptions methods
 */
export function createCRPCOptionsProxy<TApi extends Record<string, unknown>>(
  api: TApi,
  meta: CallerMeta,
  ctx: Omit<ProxyContext, 'meta'>
): CRPCClient<TApi> {
  return createRecursiveProxy(api, [], { ...ctx, meta }) as CRPCClient<TApi>;
}
