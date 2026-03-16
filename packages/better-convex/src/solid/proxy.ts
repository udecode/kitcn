/**
 * CRPC Recursive Proxy
 *
 * Creates a tRPC-like proxy that wraps Convex API functions with
 * TanStack Query options builders.
 *
 * @example
 * ```ts
 * const crpc = createCRPCOptionsProxy(api);
 * const opts = crpc.user.get.queryOptions({ id: '123' });
 * const { data } = useQuery(opts);
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
import { type ConvexQueryHookOptions, FUNC_REF_SYMBOL } from '../crpc/types';
import type { CallerMeta } from '../server/caller';
import {
  getFuncRef,
  getFunctionMeta,
  getFunctionType,
} from '../shared/meta-utils';
import type { CRPCClient, InfiniteQueryOptsParam } from './crpc-types';
import {
  useConvexActionOptions,
  useConvexActionQueryOptions,
  useConvexInfiniteQueryOptions,
  useConvexMutationOptions,
  useConvexQueryOptions,
} from './use-query-options';

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

/**
 * Create a recursive proxy that accumulates path segments.
 */
function createRecursiveProxy(
  api: Record<string, unknown>,
  path: string[],
  meta: CallerMeta,
  transformer?: DataTransformerOptions
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
            const fnType = getFunctionType(path, meta);

            // Actions use one-shot query (no subscription)
            if (fnType === 'action') {
              return useConvexActionQueryOptions(
                funcRef as FunctionReference<'action'>,
                args as Record<string, unknown>,
                opts as Parameters<typeof useConvexActionQueryOptions>[2]
              );
            }

            // useConvexQueryOptions is a hook, so this must be called from a component
            return useConvexQueryOptions(
              funcRef as FunctionReference<'query'>,
              args as Record<string, unknown>,
              opts as ConvexQueryHookOptions
            );
          };
        }

        // Terminal method: staticQueryOptions (non-hook for event handlers)
        if (prop === 'staticQueryOptions') {
          return (args: unknown = {}, opts?: { skipUnauth?: boolean }) => {
            const funcRef = getFuncRef(api, path);
            const fnType = getFunctionType(path, meta);

            // Convert skipToken to 'skip' for convexQuery/convexAction
            const finalArgs = args === skipToken ? 'skip' : args;

            // Actions use convexAction (one-shot, no subscription)
            if (fnType === 'action') {
              return convexAction(
                funcRef as FunctionReference<'action'>,
                finalArgs as FunctionArgs<FunctionReference<'action'>>,
                meta,
                opts
              );
            }

            return convexQuery(
              funcRef as FunctionReference<'query'>,
              finalArgs as FunctionArgs<FunctionReference<'query'>>,
              meta,
              opts
            );
          };
        }

        // Terminal method: queryKey
        if (prop === 'queryKey') {
          return (args: unknown = {}) => {
            const funcRef = getFuncRef(api, path);
            const funcName = getFunctionName(funcRef);
            const prefix = getQueryKeyPrefix(path, meta);
            return [prefix, funcName, args];
          };
        }

        // Terminal method: queryFilter
        if (prop === 'queryFilter') {
          return (args?: unknown, filters?: Omit<QueryFilters, 'queryKey'>) => {
            const funcRef = getFuncRef(api, path);
            const funcName = getFunctionName(funcRef);
            const prefix = getQueryKeyPrefix(path, meta);
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
            const options = useConvexInfiniteQueryOptions(funcRef, args, opts);

            // Attach funcRef via Symbol (non-enumerable, won't serialize for RSC)
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
          return getFunctionMeta(path, meta);
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
            const fnType = getFunctionType(path, meta);

            // Use type detection to determine if it's a mutation or action
            if (fnType === 'action') {
              return useConvexActionOptions(
                funcRef as FunctionReference<'action'>,
                opts as Parameters<typeof useConvexActionOptions>[1],
                transformer
              );
            }

            return useConvexMutationOptions(
              funcRef as FunctionReference<'mutation'>,
              opts as Parameters<typeof useConvexMutationOptions>[1],
              transformer
            );
          };
        }

        // Continue path accumulation
        return createRecursiveProxy(api, [...path, prop], meta, transformer);
      },
    }
  );
}

/**
 * Create a CRPC proxy for a Convex API object.
 *
 * The proxy provides a tRPC-like interface for accessing Convex functions
 * with TanStack Query options builders.
 *
 * @param api - The Convex API object (from `@convex/api`)
 * @param meta - Generated function metadata for runtime type detection
 * @returns A typed proxy with queryOptions/mutationOptions methods
 *
 * @example
 * ```tsx
 * import { api } from '@convex/api';
 *
 * // Usually you should use createCRPCContext({ api }) instead.
 * // createCRPCOptionsProxy is a low-level helper.
 * const crpc = createCRPCOptionsProxy(api, {} as any);
 *
 * function MyComponent() {
 *   const { data } = useQuery(crpc.user.get.queryOptions({ id }));
 *   const { mutate } = useMutation(crpc.user.update.mutationOptions());
 * }
 * ```
 */
export function createCRPCOptionsProxy<TApi extends Record<string, unknown>>(
  api: TApi,
  meta: CallerMeta,
  transformer?: DataTransformerOptions
): CRPCClient<TApi> {
  return createRecursiveProxy(api, [], meta, transformer) as CRPCClient<TApi>;
}
