/** biome-ignore-all lint/suspicious/noExplicitAny: Convex type compatibility */

/**
 * Server-safe query options factories for Convex functions.
 * No React hooks or context - can be imported in RSC.
 */

import type { FunctionArgs, FunctionReference } from 'convex/server';
import { getFunctionName } from 'convex/server';

import type {
  BaseConvexActionOptions,
  BaseConvexInfiniteQueryOptions,
  BaseConvexQueryOptions,
  BaseInfiniteQueryOptsParam,
  ConvexQueryMeta,
  Meta,
} from './types';

/**
 * Query options factory for Convex query function subscriptions.
 * Requires `convexQueryClient.queryFn()` set as the default `queryFn` globally.
 */
export function convexQuery<T extends FunctionReference<'query'>>(
  funcRef: T,
  args?: FunctionArgs<T> | 'skip',
  meta?: Meta,
  opts?: { skipUnauth?: boolean }
): BaseConvexQueryOptions<T> & { meta: ConvexQueryMeta } {
  const finalArgs = args ?? {};
  const isSkip = finalArgs === 'skip';

  // Get auth type from meta
  const funcName = getFunctionName(funcRef);
  const [namespace, fnName] = funcName.split(':');
  const authType = meta?.[namespace]?.[fnName]?.auth;
  // skipUnauth: return null instead of fetching when not authenticated
  const skipUnauth = opts?.skipUnauth;

  return {
    queryKey: [
      'convexQuery',
      funcName,
      isSkip
        ? ('skip' as unknown as FunctionArgs<T>)
        : (finalArgs as FunctionArgs<T>),
    ],
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    ...(isSkip ? { enabled: false } : {}),
    meta: {
      authType,
      skipUnauth,
      subscribe: true, // default, can be overridden
    },
  } as BaseConvexQueryOptions<T> & { meta: ConvexQueryMeta };
}

/**
 * Query options factory for Convex action functions.
 * Actions are NOT reactive - they follow normal TanStack Query semantics.
 *
 * @example
 * ```ts
 * useQuery(convexAction(api.ai.generate, { prompt }))
 * ```
 *
 * @example With additional options (use spread):
 * ```ts
 * useQuery({
 *   ...convexAction(api.files.process, { fileId }),
 *   staleTime: 60_000
 * });
 * ```
 */
export function convexAction<T extends FunctionReference<'action'>>(
  funcRef: T,
  args?: FunctionArgs<T> | 'skip',
  meta?: Meta,
  opts?: { skipUnauth?: boolean }
): BaseConvexActionOptions<T> & { meta: ConvexQueryMeta } {
  const finalArgs = args ?? {};
  const isSkip = finalArgs === 'skip';

  // Get auth type from meta
  const funcName = getFunctionName(funcRef);
  const [namespace, fnName] = funcName.split(':');
  const authType = meta?.[namespace]?.[fnName]?.auth;
  const skipUnauth = opts?.skipUnauth;

  return {
    queryKey: [
      'convexAction',
      funcName,
      isSkip ? ({} as FunctionArgs<T>) : (finalArgs as FunctionArgs<T>),
    ],
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    ...(isSkip ? { enabled: false } : {}),
    meta: {
      authType,
      skipUnauth,
      subscribe: false, // actions don't subscribe
    },
  } as BaseConvexActionOptions<T> & { meta: ConvexQueryMeta };
}

/**
 * Infinite query options factory for paginated Convex queries.
 * Server-safe (non-hook) - can be used in RSC.
 *
 * Uses flat { cursor, limit } input like tRPC.
 */
export function convexInfiniteQueryOptions<
  T extends FunctionReference<'query'>,
>(
  funcRef: T,
  args: Record<string, unknown> | 'skip',
  opts: BaseInfiniteQueryOptsParam<T> & Record<string, unknown> = {},
  meta?: Meta
): BaseConvexInfiniteQueryOptions<T> & Record<string, unknown> {
  // Extract our custom options, pass through the rest as TanStack Query options
  const { limit, skipUnauth, enabled, ...queryOptions } = opts;

  const finalArgs = args === 'skip' ? {} : args;
  const isSkip = args === 'skip';

  const funcName = getFunctionName(funcRef);
  const [namespace, fnName] = funcName.split(':');
  const fnMeta = meta?.[namespace]?.[fnName];
  const authType = fnMeta?.auth as 'required' | 'optional' | undefined;

  // Flat pagination args - tRPC style
  const firstPageArgs = {
    ...finalArgs,
    cursor: null,
    limit,
  };

  // Determine enabled state: explicit false or skip takes precedence
  const finalEnabled = enabled === false || isSkip ? false : undefined;

  return {
    queryKey: ['convexQuery', funcName, firstPageArgs] as const,
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false as const,
    refetchOnMount: false as const,
    refetchOnReconnect: false as const,
    refetchOnWindowFocus: false as const,
    ...queryOptions,
    ...(finalEnabled === false ? { enabled: false } : {}),
    meta: {
      authType,
      skipUnauth,
      subscribe: true,
      queryName: funcName,
      args: finalArgs,
      limit,
    },
  };
}
