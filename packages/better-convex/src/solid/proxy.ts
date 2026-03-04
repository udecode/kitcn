/**
 * CRPC Recursive Proxy for SolidJS
 *
 * Creates a tRPC-like proxy that wraps Convex API functions with
 * TanStack Query options builders (solid-query compatible).
 *
 * @example
 * ```ts
 * const crpc = createCRPCOptionsProxy(api, meta);
 * const opts = crpc.user.get.queryOptions({ id: '123' });
 * const query = createQuery(() => opts);
 * ```
 */

import {
  type QueryFilters,
  type SkipToken,
  skipToken,
} from '@tanstack/query-core';
import type { FunctionArgs, FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';
import { convexAction, convexQuery } from '../crpc/query-options';
import type { DataTransformerOptions } from '../crpc/transformer';
import {
  type ConvexQueryHookOptions,
  FUNC_REF_SYMBOL,
  type InfiniteQueryOptsParam,
} from '../crpc/types';
import type { CallerMeta } from '../server/caller';
import {
  getFuncRef,
  getFunctionMeta,
  getFunctionType,
} from '../shared/meta-utils';
import {
  createConvexActionOptions,
  createConvexActionQueryOptions,
  createConvexInfiniteQueryOptions,
  createConvexMutationOptions,
  createConvexQueryOptions,
} from './query-options';
import type { SolidCRPCClient } from './types';

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
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return; // Prevent Promise detection

      // Terminal method: queryOptions
      if (prop === 'queryOptions') {
        return (args: unknown = {}, opts?: unknown) => {
          const funcRef = getFuncRef(api, path);
          const fnType = getFunctionType(path, meta);

          if (fnType === 'action') {
            return createConvexActionQueryOptions(
              funcRef as FunctionReference<'action'>,
              args as Record<string, unknown>,
              opts as Parameters<typeof createConvexActionQueryOptions>[2]
            );
          }

          return createConvexQueryOptions(
            funcRef as FunctionReference<'query'>,
            args as Record<string, unknown>,
            opts as ConvexQueryHookOptions
          );
        };
      }

      // Terminal method: staticQueryOptions (non-reactive, for event handlers)
      if (prop === 'staticQueryOptions') {
        return (args: unknown = {}, opts?: { skipUnauth?: boolean }) => {
          const funcRef = getFuncRef(api, path);
          const fnType = getFunctionType(path, meta);

          const finalArgs = args === skipToken ? 'skip' : args;

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
          const options = createConvexInfiniteQueryOptions(funcRef, args, opts);

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

          if (fnType === 'action') {
            return createConvexActionOptions(
              funcRef as FunctionReference<'action'>,
              opts as Parameters<typeof createConvexActionOptions>[1],
              transformer
            );
          }

          return createConvexMutationOptions(
            funcRef as FunctionReference<'mutation'>,
            opts as Parameters<typeof createConvexMutationOptions>[1],
            transformer
          );
        };
      }

      // Continue path accumulation
      return createRecursiveProxy(api, [...path, prop], meta, transformer);
    },
  });
}

/**
 * Create a CRPC proxy for a Convex API object (SolidJS).
 *
 * @param api - The Convex API object (from `@convex/api`)
 * @param meta - Generated function metadata for runtime type detection
 * @returns A typed proxy with queryOptions/mutationOptions methods
 *
 * @example
 * ```tsx
 * const crpc = createCRPCOptionsProxy(api, {} as any);
 *
 * function MyComponent() {
 *   const data = createQuery(() => crpc.user.get.queryOptions({ id }));
 *   const mutation = createMutation(() => crpc.user.update.mutationOptions());
 * }
 * ```
 */
export function createCRPCOptionsProxy<TApi extends Record<string, unknown>>(
  api: TApi,
  meta: CallerMeta,
  transformer?: DataTransformerOptions
): SolidCRPCClient<TApi> {
  return createRecursiveProxy(
    api,
    [],
    meta,
    transformer
  ) as SolidCRPCClient<TApi>;
}
