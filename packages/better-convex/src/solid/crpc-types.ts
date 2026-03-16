/**
 * SolidJS-specific CRPC Types
 *
 * Decorator types that depend on @tanstack/solid-query and convex/browser.
 */

import type {
  DefaultError,
  QueryFilters,
  SkipToken,
  SolidMutationOptions,
  SolidQueryOptions,
} from '@tanstack/solid-query';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';
import type {
  ConvexActionKey,
  ConvexInfiniteQueryMeta,
  ConvexMutationKey,
  ConvexQueryHookOptions,
  ConvexQueryKey,
  ConvexQueryMeta,
  EmptyObject,
  ExtractPaginatedItem,
  FUNC_REF_SYMBOL,
  InfiniteQueryInput,
  IsPaginated,
  MutationVariables,
  PaginatedFnMeta,
  ReservedInfiniteQueryOptions,
  ReservedMutationOptions,
  ReservedQueryOptions,
  StaticQueryOptsParam,
} from '../crpc/types';
import type {
  DeepPartial,
  DistributiveOmit,
  Simplify,
} from '../internal/types';

// ============================================================================
// Unsubscribe type (mirrors convex/browser ConvexClient.onUpdate return type)
// ============================================================================

/** Stops callbacks from running. Matches convex/browser Unsubscribe<T>. */
export type Unsubscribe<T> = {
  /** Stop calling callback when query results change. */
  (): void;
  /** Stop calling callback when query results change. */
  unsubscribe(): void;
  /** Get the last known value, possibly with local optimistic updates applied. */
  getCurrentValue(): T | undefined;
};

// ============================================================================
// Query Options Types (SolidJS-specific)
// ============================================================================

/** Options returned by `convexQuery` factory */
export type ConvexQueryOptions<T extends FunctionReference<'query'>> = Pick<
  SolidQueryOptions<
    FunctionReturnType<T>,
    Error,
    FunctionReturnType<T>,
    ConvexQueryKey<T>
  >,
  'queryKey' | 'staleTime' | 'enabled'
>;

/** Options returned by `convexAction` factory */
export type ConvexActionOptions<T extends FunctionReference<'action'>> = Pick<
  SolidQueryOptions<
    FunctionReturnType<T>,
    Error,
    FunctionReturnType<T>,
    ConvexActionKey<T>
  >,
  'queryKey' | 'staleTime' | 'enabled'
>;

// ============================================================================
// Procedure Decorators (SolidJS-specific)
// ============================================================================

/** Query options parameter type */
type QueryOptsParam<T extends FunctionReference<'query'>> = Simplify<
  ConvexQueryHookOptions &
    DistributiveOmit<
      SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
      ReservedQueryOptions
    >
>;

/** Query options return type */
type QueryOptsReturn<T extends FunctionReference<'query'>> =
  ConvexQueryOptions<T> & { meta: ConvexQueryMeta };

/** Action query options parameter type (actions don't support subscriptions) */
type ActionQueryOptsParam<T extends FunctionReference<'action'>> =
  DistributiveOmit<
    SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
    ReservedQueryOptions
  >;

/** Action query options return type */
type ActionQueryOptsReturn<T extends FunctionReference<'action'>> =
  ConvexActionOptions<T>;

/**
 * Decorated query procedure with queryOptions, queryKey, and queryFilter methods.
 * Args are optional when the function has no required parameters.
 * Supports skipToken for type-safe conditional queries.
 */
export type DecorateQuery<T extends FunctionReference<'query'>> = {
  queryOptions: keyof FunctionArgs<T> extends never
    ? // No args defined → optional, also accepts skipToken
      (
        args?: EmptyObject | SkipToken,
        opts?: QueryOptsParam<T>
      ) => QueryOptsReturn<T>
    : EmptyObject extends FunctionArgs<T>
      ? // All args optional → optional, also accepts skipToken
        (
          args?: FunctionArgs<T> | SkipToken,
          opts?: QueryOptsParam<T>
        ) => QueryOptsReturn<T>
      : // Has required args → required, also accepts skipToken
        (
          args: FunctionArgs<T> | SkipToken,
          opts?: QueryOptsParam<T>
        ) => QueryOptsReturn<T>;
  /** Static (non-hook) query options for event handlers and prefetching */
  staticQueryOptions: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject | SkipToken,
        opts?: StaticQueryOptsParam
      ) => ConvexQueryOptions<T> & { meta: ConvexQueryMeta }
    : EmptyObject extends FunctionArgs<T>
      ? (
          args?: FunctionArgs<T> | SkipToken,
          opts?: StaticQueryOptsParam
        ) => ConvexQueryOptions<T> & { meta: ConvexQueryMeta }
      : (
          args: FunctionArgs<T> | SkipToken,
          opts?: StaticQueryOptsParam
        ) => ConvexQueryOptions<T> & { meta: ConvexQueryMeta };
  /** Get query key for QueryClient methods (setQueryData, getQueryData, etc.) */
  queryKey: (args?: DeepPartial<FunctionArgs<T>>) => ConvexQueryKey<T>;
  /** Get query filter for QueryClient methods (invalidateQueries, removeQueries, etc.) */
  queryFilter: (
    args?: DeepPartial<FunctionArgs<T>>,
    filters?: DistributiveOmit<QueryFilters, 'queryKey'>
  ) => QueryFilters;
};

// ============================================================================
// Infinite Query Types (SolidJS-specific)
// ============================================================================

/** Options for infinite query - extends TanStack Query options */
export type InfiniteQueryOptsParam<
  T extends FunctionReference<'query'> = FunctionReference<'query'>,
> = {
  /** Items per page. Optional - server uses .paginated() default if not provided. */
  limit?: number;
  /** Skip query silently when unauthenticated */
  skipUnauth?: boolean;
  /** Placeholder data shown while loading (item array, not pagination result) */
  placeholderData?: ExtractPaginatedItem<FunctionReturnType<T>>[];
} & DistributiveOmit<
  SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
  ReservedInfiniteQueryOptions
>;

/** Return type of infiniteQueryOptions - compatible with TanStack prefetch */
export type ConvexInfiniteQueryOptions<T extends FunctionReference<'query'>> =
  Pick<
    SolidQueryOptions<
      FunctionReturnType<T>,
      Error,
      FunctionReturnType<T>,
      ConvexQueryKey<T>
    >,
    'queryKey' | 'staleTime' | 'enabled'
  > & {
    meta: ConvexInfiniteQueryMeta;
    refetchInterval: false;
    refetchOnMount: false;
    refetchOnReconnect: false;
    refetchOnWindowFocus: false;
    /** Placeholder data shown while loading (item array, not pagination result) */
    placeholderData?: ExtractPaginatedItem<FunctionReturnType<T>>[];
  } & DistributiveOmit<
      SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
      ReservedInfiniteQueryOptions
    >;

/** Infinite query options with attached function reference (client-only) */
export type ConvexInfiniteQueryOptionsWithRef<
  T extends FunctionReference<'query'>,
> = ConvexInfiniteQueryOptions<T> & {
  [FUNC_REF_SYMBOL]: T;
};

/** Infinite query options return type */
type InfiniteQueryOptsReturn<T extends FunctionReference<'query'>> =
  ConvexInfiniteQueryOptionsWithRef<T>;

/**
 * Decorated infinite query procedure.
 * Only available on queries that have cursor/limit in their input (paginated).
 * Supports skipToken for conditional queries.
 * Args are optional when the function has no required parameters (besides cursor/limit).
 */
export type DecorateInfiniteQuery<T extends FunctionReference<'query'>> = {
  /** Create infinite query options for useInfiniteQuery and prefetch */
  infiniteQueryOptions: keyof InfiniteQueryInput<FunctionArgs<T>> extends never
    ? // No args defined (besides cursor/limit) → optional, also accepts skipToken
      (
        args?: EmptyObject | SkipToken,
        opts?: InfiniteQueryOptsParam<T>
      ) => InfiniteQueryOptsReturn<T>
    : EmptyObject extends InfiniteQueryInput<FunctionArgs<T>>
      ? // All args optional (besides cursor/limit) → optional, also accepts skipToken
        (
          args?: InfiniteQueryInput<FunctionArgs<T>> | SkipToken,
          opts?: InfiniteQueryOptsParam<T>
        ) => InfiniteQueryOptsReturn<T>
      : // Has required args → required, also accepts skipToken
        (
          args: InfiniteQueryInput<FunctionArgs<T>> | SkipToken,
          opts?: InfiniteQueryOptsParam<T>
        ) => InfiniteQueryOptsReturn<T>;
  /** Get query key for infinite query (QueryClient methods like setQueryData, getQueryData) */
  infiniteQueryKey: (
    args?: DeepPartial<InfiniteQueryInput<FunctionArgs<T>>>
  ) => ConvexQueryKey<T>;
  /** Function metadata from server (auth, limit, rateLimit, role, type) */
  meta: PaginatedFnMeta;
};

// ============================================================================
// Mutation & Action Decorators (SolidJS-specific)
// ============================================================================

/**
 * Decorated mutation procedure with mutationOptions and mutationKey methods.
 */
export type DecorateMutation<T extends FunctionReference<'mutation'>> = {
  mutationOptions: (
    opts?: DistributiveOmit<
      SolidMutationOptions<
        FunctionReturnType<T>,
        DefaultError,
        MutationVariables<T>
      >,
      ReservedMutationOptions
    >
  ) => SolidMutationOptions<
    FunctionReturnType<T>,
    DefaultError,
    MutationVariables<T>
  >;
  /** Get mutation key for QueryClient methods */
  mutationKey: () => ConvexMutationKey;
};

/**
 * Decorated action procedure with queryOptions, mutationOptions, and key methods.
 * Actions can be used as one-shot queries (no subscription) or as mutations.
 * Supports skipToken for conditional queries.
 */
export type DecorateAction<T extends FunctionReference<'action'>> = {
  /** Use action as a one-shot query (no WebSocket subscription) */
  queryOptions: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject | SkipToken,
        opts?: ActionQueryOptsParam<T>
      ) => ActionQueryOptsReturn<T>
    : EmptyObject extends FunctionArgs<T>
      ? (
          args?: FunctionArgs<T> | SkipToken,
          opts?: ActionQueryOptsParam<T>
        ) => ActionQueryOptsReturn<T>
      : (
          args: FunctionArgs<T> | SkipToken,
          opts?: ActionQueryOptsParam<T>
        ) => ActionQueryOptsReturn<T>;
  /** Static (non-hook) action query options for event handlers and prefetching */
  staticQueryOptions: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject | SkipToken,
        opts?: StaticQueryOptsParam
      ) => ConvexActionOptions<T> & { meta: ConvexQueryMeta }
    : EmptyObject extends FunctionArgs<T>
      ? (
          args?: FunctionArgs<T> | SkipToken,
          opts?: StaticQueryOptsParam
        ) => ConvexActionOptions<T> & { meta: ConvexQueryMeta }
      : (
          args: FunctionArgs<T> | SkipToken,
          opts?: StaticQueryOptsParam
        ) => ConvexActionOptions<T> & { meta: ConvexQueryMeta };
  /** Use action as a mutation */
  mutationOptions: (
    opts?: DistributiveOmit<
      SolidMutationOptions<
        FunctionReturnType<T>,
        DefaultError,
        MutationVariables<T>
      >,
      ReservedMutationOptions
    >
  ) => SolidMutationOptions<
    FunctionReturnType<T>,
    DefaultError,
    MutationVariables<T>
  >;
  /** Get mutation key for QueryClient methods */
  mutationKey: () => ConvexMutationKey;
  /** Get query key for QueryClient methods */
  queryKey: (args?: DeepPartial<FunctionArgs<T>>) => ConvexActionKey<T>;
  /** Get query filter for QueryClient methods */
  queryFilter: (
    args?: DeepPartial<FunctionArgs<T>>,
    filters?: DistributiveOmit<QueryFilters, 'queryKey'>
  ) => QueryFilters;
};

// ============================================================================
// Vanilla Client Types (SolidJS-specific — uses onUpdate pattern)
// ============================================================================

/** Vanilla query - direct .query() and .onUpdate() calls without Solid Query */
export type VanillaQuery<T extends FunctionReference<'query'>> = {
  query: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
  onUpdate: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject,
        callback?: (result: FunctionReturnType<T>) => void,
        onError?: (e: Error) => void
      ) => Unsubscribe<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (
          args?: FunctionArgs<T>,
          callback?: (result: FunctionReturnType<T>) => void,
          onError?: (e: Error) => void
        ) => Unsubscribe<FunctionReturnType<T>>
      : (
          args: FunctionArgs<T>,
          callback: (result: FunctionReturnType<T>) => void,
          onError?: (e: Error) => void
        ) => Unsubscribe<FunctionReturnType<T>>;
};

// ============================================================================
// Recursive Client Types (SolidJS-specific)
// ============================================================================

/**
 * Recursively creates vanilla client type for direct procedural calls.
 */
export type VanillaCRPCClient<TApi> = {
  [K in keyof TApi as K extends string
    ? K extends `_${string}`
      ? never
      : K
    : K]: TApi[K] extends FunctionReference<'query'>
    ? VanillaQuery<TApi[K]>
    : TApi[K] extends FunctionReference<'mutation'>
      ? import('../crpc/types').VanillaMutation<TApi[K]>
      : TApi[K] extends FunctionReference<'action'>
        ? import('../crpc/types').VanillaAction<TApi[K]>
        : TApi[K] extends Record<string, unknown>
          ? VanillaCRPCClient<TApi[K]>
          : never;
};

/**
 * Recursively decorates all procedures in a Convex API object.
 */
export type CRPCClient<TApi> = {
  [K in keyof TApi as K extends string
    ? K extends `_${string}`
      ? never
      : K
    : K]: TApi[K] extends FunctionReference<'query'>
    ? IsPaginated<FunctionArgs<TApi[K]>> extends true
      ? DecorateQuery<TApi[K]> & DecorateInfiniteQuery<TApi[K]>
      : DecorateQuery<TApi[K]>
    : TApi[K] extends FunctionReference<'mutation'>
      ? DecorateMutation<TApi[K]>
      : TApi[K] extends FunctionReference<'action'>
        ? DecorateAction<TApi[K]>
        : TApi[K] extends Record<string, unknown>
          ? CRPCClient<TApi[K]>
          : never;
};
