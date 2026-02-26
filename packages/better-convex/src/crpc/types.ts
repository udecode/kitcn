/**
 * CRPC Types
 *
 * Query types and procedure decorators for tRPC-like Convex API interfaces.
 */

import type {
  DefaultError,
  QueryFilters,
  SkipToken,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import type { Watch, WatchQueryOptions } from 'convex/react';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server';

import type {
  DeepPartial,
  DistributiveOmit,
  Simplify,
} from '../internal/types';

// ============================================================================
// Symbol for FunctionReference (non-serializable)
// ============================================================================

/** Symbol key for attaching FunctionReference to options (non-serializable) */
export const FUNC_REF_SYMBOL: unique symbol = Symbol.for('convex.funcRef');

// ============================================================================
// Reserved Options (tRPC pattern)
// ============================================================================

/** Options controlled by convexQuery/convexAction factories */
type ReservedQueryOptions = 'queryKey' | 'queryFn' | 'staleTime';

/** Options controlled by mutation factories */
type ReservedMutationOptions = 'mutationFn';

// ============================================================================
// Meta Types
// ============================================================================

/** Metadata for a single Convex function */
export type FnMeta = {
  auth?: 'required' | 'optional';
  role?: string;
  rateLimit?: string;
  type?: 'query' | 'mutation' | 'action';
  limit?: number;
  [key: string]: unknown;
};

/** Metadata for paginated functions (limit is required) */
export type PaginatedFnMeta = Omit<FnMeta, 'limit'> & { limit: number };

/** Metadata for all Convex functions by namespace.fnName, with _http for HTTP routes */
export type Meta = Record<string, Record<string, FnMeta>> & {
  _http?: Record<string, { path: string; method: string }>;
};

// ============================================================================
// Query Types
// ============================================================================

/** Authentication requirement for a Convex function */
export type AuthType = 'required' | 'optional' | undefined;

/** Query key structure for Convex queries */
export type ConvexQueryKey<T extends FunctionReference<'query'>> = readonly [
  'convexQuery',
  string, // Function name (serialized)
  FunctionArgs<T>,
];

/** Query key structure for Convex actions */
export type ConvexActionKey<T extends FunctionReference<'action'>> = readonly [
  'convexAction',
  string, // Function name (serialized)
  FunctionArgs<T>,
];

/** Mutation key structure for Convex mutations/actions */
export type ConvexMutationKey = ['convexMutation', string];

/**
 * Meta passed to TanStack Query for auth and subscription control.
 * Set by convexQuery, read by ConvexQueryClient.queryFn() and subscribeInner().
 */
export type ConvexQueryMeta = {
  /** Auth type from generated Convex metadata via getMeta() */
  authType?: 'required' | 'optional';
  /** Skip query silently when unauthenticated (returns null) */
  skipUnauth?: boolean;
  /** Whether to create WebSocket subscription (default: true) */
  subscribe?: boolean;
};

/** Options returned by `convexQuery` factory */
export type ConvexQueryOptions<T extends FunctionReference<'query'>> = Pick<
  UseQueryOptions<
    FunctionReturnType<T>,
    Error,
    FunctionReturnType<T>,
    ConvexQueryKey<T>
  >,
  'queryKey' | 'staleTime' | 'enabled'
>;

/** Options returned by `convexAction` factory */
export type ConvexActionOptions<T extends FunctionReference<'action'>> = Pick<
  UseQueryOptions<
    FunctionReturnType<T>,
    Error,
    FunctionReturnType<T>,
    ConvexActionKey<T>
  >,
  'queryKey' | 'staleTime' | 'enabled'
>;

/** Hook options for Convex queries */
export type ConvexQueryHookOptions = {
  /** Skip query silently when unauthenticated (default: false, calls onQueryUnauthorized) */
  skipUnauth?: boolean;
  /** Set to false to fetch once without subscribing (default: true) */
  subscribe?: boolean;
};

// ============================================================================
// Pagination Types
// ============================================================================

/** Internal Convex pagination options (used by .paginate()) */
export type PaginationOpts = {
  cursor: string | null;
  numItems: number;
  endCursor?: string | null;
  id?: number;
  maximumRowsRead?: number;
  maximumBytesRead?: number;
};

/** Extract input args without cursor/limit (user's filter args only) */
export type InfiniteQueryInput<TInput> = Omit<TInput, 'cursor' | 'limit'>;

/** Extract item type from PaginationResult<T> */
export type ExtractPaginatedItem<TOutput> = TOutput extends {
  page: (infer T)[];
}
  ? T
  : never;

// ============================================================================
// Procedure Decorators
// ============================================================================

type EmptyObject = Record<string, never>;

/** Query options parameter type */
type QueryOptsParam<T extends FunctionReference<'query'>> = Simplify<
  ConvexQueryHookOptions &
    DistributiveOmit<
      UseQueryOptions<FunctionReturnType<T>, DefaultError>,
      ReservedQueryOptions
    >
>;

/** Query options return type */
type QueryOptsReturn<T extends FunctionReference<'query'>> =
  ConvexQueryOptions<T> & { meta: ConvexQueryMeta };

/** Action query options parameter type (actions don't support subscriptions) */
type ActionQueryOptsParam<T extends FunctionReference<'action'>> =
  DistributiveOmit<
    UseQueryOptions<FunctionReturnType<T>, DefaultError>,
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
/** Static query options parameter type (non-hook, for event handlers) */
type StaticQueryOptsParam = { skipUnauth?: boolean };

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
// Infinite Query Types
// ============================================================================

/** Reserved options controlled by infinite query factories */
type ReservedInfiniteQueryOptions =
  | 'queryKey'
  | 'queryFn'
  | 'staleTime'
  | 'refetchInterval'
  | 'refetchOnMount'
  | 'refetchOnReconnect'
  | 'refetchOnWindowFocus'
  | 'persister'
  | 'placeholderData';

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
  UseQueryOptions<FunctionReturnType<T>, DefaultError>,
  ReservedInfiniteQueryOptions
>;

/** Metadata for infinite query (extends ConvexQueryMeta) */
export type ConvexInfiniteQueryMeta = ConvexQueryMeta & {
  /** The query function name (serializable for RSC) */
  queryName: string;
  /** Query args without cursor/limit (user's filter args only) */
  args: Record<string, unknown>;
  /** Items per page (optional - server uses .paginated() default) */
  limit?: number;
};

/** Return type of infiniteQueryOptions - compatible with TanStack prefetch */
export type ConvexInfiniteQueryOptions<T extends FunctionReference<'query'>> =
  Pick<
    UseQueryOptions<
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
      UseQueryOptions<FunctionReturnType<T>, DefaultError>,
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

/** Mutation variables type - undefined when no args required (allows mutateAsync() without args) */
type MutationVariables<T extends FunctionReference<'mutation' | 'action'>> =
  keyof FunctionArgs<T> extends never
    ? // biome-ignore lint/suspicious/noConfusingVoidType: TanStack Query requires void for optional variables
      void
    : EmptyObject extends FunctionArgs<T>
      ? FunctionArgs<T> | undefined
      : FunctionArgs<T>;

/**
 * Decorated mutation procedure with mutationOptions and mutationKey methods.
 */
export type DecorateMutation<T extends FunctionReference<'mutation'>> = {
  mutationOptions: (
    opts?: DistributiveOmit<
      UseMutationOptions<
        FunctionReturnType<T>,
        DefaultError,
        MutationVariables<T>
      >,
      ReservedMutationOptions
    >
  ) => UseMutationOptions<
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
      UseMutationOptions<
        FunctionReturnType<T>,
        DefaultError,
        MutationVariables<T>
      >,
      ReservedMutationOptions
    >
  ) => UseMutationOptions<
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
// Vanilla Client Types (for direct procedural calls)
// ============================================================================

/** Vanilla query - direct .query() and .watchQuery() calls without React Query */
export type VanillaQuery<T extends FunctionReference<'query'>> = {
  query: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
  watchQuery: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject,
        opts?: WatchQueryOptions
      ) => Watch<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (
          args?: FunctionArgs<T>,
          opts?: WatchQueryOptions
        ) => Watch<FunctionReturnType<T>>
      : (
          args: FunctionArgs<T>,
          opts?: WatchQueryOptions
        ) => Watch<FunctionReturnType<T>>;
};

/** Vanilla mutation - direct .mutate() call without React Query */
export type VanillaMutation<T extends FunctionReference<'mutation'>> = {
  mutate: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
};

/** Vanilla action - both .query() and .mutate() for direct calls */
export type VanillaAction<T extends FunctionReference<'action'>> = {
  query: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
  mutate: keyof FunctionArgs<T> extends never
    ? (args?: EmptyObject) => Promise<FunctionReturnType<T>>
    : EmptyObject extends FunctionArgs<T>
      ? (args?: FunctionArgs<T>) => Promise<FunctionReturnType<T>>
      : (args: FunctionArgs<T>) => Promise<FunctionReturnType<T>>;
};

/**
 * Recursively creates vanilla client type for direct procedural calls.
 * Similar to CRPCClient but for imperative usage outside React Query.
 *
 * @example
 * ```ts
 * const client = useCRPCClient();
 * await client.user.get.query({ id });
 * await client.user.update.mutate({ id, name: 'test' });
 * ```
 */
export type VanillaCRPCClient<TApi> = {
  [K in keyof TApi as K extends string
    ? K extends `_${string}`
      ? never
      : K
    : K]: TApi[K] extends FunctionReference<'query'>
    ? VanillaQuery<TApi[K]>
    : TApi[K] extends FunctionReference<'mutation'>
      ? VanillaMutation<TApi[K]>
      : TApi[K] extends FunctionReference<'action'>
        ? VanillaAction<TApi[K]>
        : TApi[K] extends Record<string, unknown>
          ? VanillaCRPCClient<TApi[K]>
          : never;
};

// ============================================================================
// Recursive Client Type
// ============================================================================

/**
 * Recursively decorates all procedures in a Convex API object.
 *
 * - Queries get `queryOptions(args, opts?)`
 * - Paginated queries also get `infiniteQueryOptions(args, opts)`
 * - Mutations get `mutationOptions(opts?)`
 * - Actions get `mutationOptions(opts?)`
 * - Nested objects are recursively decorated
 *
 * @example
 * ```ts
 * type Client = CRPCClient<typeof api>;
 * // Client.user.get.queryOptions({ id }) -> QueryOptions
 * // Client.posts.list.infiniteQueryOptions({ userId }, { initialNumItems: 20 }) -> InfiniteQueryOptions
 * // Client.user.update.mutationOptions() -> MutationOptions
 * ```
 */
/** Check if a type has cursor key (pagination detection) */
type IsPaginated<T> = 'cursor' extends keyof T ? true : false;

export type CRPCClient<TApi> = {
  [K in keyof TApi as K extends string
    ? K extends `_${string}`
      ? never
      : K
    : K]: TApi[K] extends FunctionReference<'query'>
    ? // Paginated queries get both regular and infinite query methods
      // Check if args have cursor and limit keys (works with optional types)
      IsPaginated<FunctionArgs<TApi[K]>> extends true
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
