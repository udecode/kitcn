/** biome-ignore-all lint/suspicious/noExplicitAny: Convex type compatibility */

/**
 * Query options factories for Convex functions (SolidJS).
 * Plain functions (not hooks) - return option objects passed to createQuery(() => options).
 */

import type {
  DefaultError,
  MutationObserverOptions,
  SkipToken,
} from '@tanstack/query-core';
import { skipToken } from '@tanstack/query-core';
import type {
  SolidMutationOptions,
  SolidQueryOptions,
} from '@tanstack/solid-query';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import { getFunctionName } from 'convex/server';
import {
  convexAction,
  convexInfiniteQueryOptions,
  convexQuery,
} from '../crpc/query-options';
import {
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import type {
  ConvexActionOptions,
  ConvexInfiniteQueryOptions,
  ConvexQueryHookOptions,
  ConvexQueryMeta,
  ConvexQueryOptions,
  InfiniteQueryInput,
  InfiniteQueryOptsParam,
} from '../crpc/types';
import type { DistributiveOmit } from '../internal/types';
import { useAuthSkip } from './auth';

// Reserved options that we control - users cannot override these
type ReservedQueryOptions = 'queryKey' | 'queryFn' | 'staleTime';
type ReservedMutationOptions = 'mutationFn';

/**
 * Returns query options for use with createQuery.
 * Unlike the React hook version, this is a plain function (no hooks).
 *
 * @example
 * ```tsx
 * const queryOpts = createConvexQueryOptions(api.user.get, { id });
 * const query = createQuery(() => queryOpts);
 * ```
 */
export function createConvexQueryOptions<T extends FunctionReference<'query'>>(
  funcRef: T,
  args: FunctionArgs<T> | SkipToken,
  options?: ConvexQueryHookOptions &
    DistributiveOmit<
      SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
      ReservedQueryOptions
    >
): ConvexQueryOptions<T> & { meta: ConvexQueryMeta } {
  const isSkipped = args === skipToken;

  const enabled =
    typeof options?.enabled === 'function' ? undefined : options?.enabled;
  const { authType, shouldSkip } = useAuthSkip(funcRef, {
    enabled: isSkipped ? false : enabled,
    skipUnauth: options?.skipUnauth,
  });

  const baseOptions = convexQuery(
    funcRef,
    isSkipped ? ({} as FunctionArgs<T>) : args
  );

  const { skipUnauth: _, subscribe, ...queryOptions } = options ?? {};

  return {
    ...baseOptions,
    ...queryOptions,
    enabled: isSkipped ? false : !shouldSkip,
    meta: {
      ...baseOptions.meta,
      authType,
      subscribe: subscribe !== false,
    },
  };
}

/**
 * Returns infinite query options for use with createInfiniteQuery (SolidJS).
 */
export function createConvexInfiniteQueryOptions<
  T extends FunctionReference<'query'>,
>(
  funcRef: T,
  args: InfiniteQueryInput<FunctionArgs<T>> | SkipToken,
  opts: InfiniteQueryOptsParam<T>
): ConvexInfiniteQueryOptions<T> {
  const isSkipped = args === skipToken;

  const enabledOpt =
    typeof opts.enabled === 'function' ? undefined : opts.enabled;

  const { authType, shouldSkip } = useAuthSkip(funcRef, {
    enabled: isSkipped ? false : enabledOpt,
    skipUnauth: opts.skipUnauth,
  });

  const enabled = isSkipped || shouldSkip ? false : enabledOpt;

  const baseOptions = convexInfiniteQueryOptions(
    funcRef,
    isSkipped ? ({} as InfiniteQueryInput<FunctionArgs<T>>) : args,
    { ...opts, enabled },
    undefined
  );

  return {
    ...baseOptions,
    meta: {
      ...baseOptions.meta,
      authType,
    },
  };
}

/**
 * Returns query options for using an action as a one-shot query.
 */
export function createConvexActionQueryOptions<
  Action extends FunctionReference<'action'>,
>(
  action: Action,
  args: FunctionArgs<Action> | SkipToken,
  options?: { skipUnauth?: boolean } & DistributiveOmit<
    SolidQueryOptions<FunctionReturnType<Action>, DefaultError>,
    ReservedQueryOptions
  >
): ConvexActionOptions<Action> {
  const isSkipped = args === skipToken;

  const enabled =
    typeof options?.enabled === 'function' ? undefined : options?.enabled;
  const { shouldSkip } = useAuthSkip(action, {
    enabled: isSkipped ? false : enabled,
    skipUnauth: options?.skipUnauth,
  });

  const baseOptions = convexAction(
    action,
    isSkipped ? ({} as FunctionArgs<Action>) : args
  );

  const { skipUnauth: _, ...queryOptions } = options ?? {};

  return {
    ...baseOptions,
    ...queryOptions,
    enabled: isSkipped ? false : !shouldSkip,
  };
}

/**
 * Returns mutation options for use with createMutation.
 */
export function createConvexMutationOptions<
  Mutation extends FunctionReference<'mutation'>,
>(
  mutation: Mutation,
  options?: DistributiveOmit<
    SolidMutationOptions<
      FunctionReturnType<Mutation>,
      DefaultError,
      FunctionArgs<Mutation>
    >,
    ReservedMutationOptions
  >,
  transformer?: DataTransformerOptions
): MutationObserverOptions<
  FunctionReturnType<Mutation>,
  DefaultError,
  FunctionArgs<Mutation>
> {
  getFunctionName(mutation);
  const resolvedTransformer = getTransformer(transformer);

  return {
    ...options,
    mutationFn: async (args: FunctionArgs<Mutation>) => {
      return resolvedTransformer.input.serialize(args) as any;
    },
  };
}

/**
 * Returns action options for use as a mutation with createMutation.
 */
export function createConvexActionOptions<
  Action extends FunctionReference<'action'>,
>(
  action: Action,
  options?: DistributiveOmit<
    SolidMutationOptions<
      FunctionReturnType<Action>,
      DefaultError,
      FunctionArgs<Action>
    >,
    ReservedMutationOptions
  >,
  transformer?: DataTransformerOptions
): MutationObserverOptions<
  FunctionReturnType<Action>,
  DefaultError,
  FunctionArgs<Action>
> {
  getFunctionName(action);
  const resolvedTransformer = getTransformer(transformer);

  return {
    ...options,
    mutationFn: async (args: FunctionArgs<Action>) => {
      return resolvedTransformer.input.serialize(args) as any;
    },
  };
}

/**
 * Returns upload mutation options for use with createMutation.
 * Generates a presigned URL, then uploads the file directly to storage.
 */
export function createUploadMutationOptions<
  TGenerateUrlMutation extends FunctionReference<
    'mutation',
    'public',
    any,
    { key: string; url: string }
  >,
>(
  _generateUrlMutation: TGenerateUrlMutation,
  options?: DistributiveOmit<
    SolidMutationOptions<
      FunctionReturnType<TGenerateUrlMutation>,
      DefaultError,
      { file: File } & FunctionArgs<TGenerateUrlMutation>
    >,
    ReservedMutationOptions
  >
): MutationObserverOptions<
  FunctionReturnType<TGenerateUrlMutation>,
  DefaultError,
  { file: File } & FunctionArgs<TGenerateUrlMutation>
> {
  return {
    ...options,
    mutationFn: async (
      _args: { file: File } & FunctionArgs<TGenerateUrlMutation>
    ) => {
      // Placeholder - actual implementation needs convex client
      // Full implementation wired in Phase 3 via context
      throw new Error(
        'createUploadMutationOptions requires a convex client. Use the context-aware version from createCRPCContext.'
      );
    },
  };
}
