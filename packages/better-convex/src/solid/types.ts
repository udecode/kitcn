/**
 * Solid CRPC Types
 *
 * Query types and procedure decorators for SolidJS using @tanstack/solid-query.
 */

import type {
  DefaultError,
  MutationObserverOptions,
  QueryFilters,
  SkipToken,
} from '@tanstack/query-core';
import type {
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
  ConvexActionOptions,
  ConvexInfiniteQueryOptionsWithRef,
  ConvexMutationKey,
  ConvexQueryHookOptions,
  ConvexQueryKey,
  ConvexQueryMeta,
  ConvexQueryOptions,
  ExtractPaginatedItem,
  InfiniteQueryInput,
  PaginatedFnMeta,
} from '../crpc/types';
import type {
  DeepPartial,
  DistributiveOmit,
  Simplify,
} from '../internal/types';

export type {
  ConvexActionKey,
  ConvexActionOptions,
  ConvexInfiniteQueryOptions,
  ConvexInfiniteQueryOptionsWithRef,
  ConvexMutationKey,
  ConvexQueryHookOptions,
  ConvexQueryKey,
  ConvexQueryMeta,
  ConvexQueryOptions,
  CRPCClient,
  DecorateAction,
  DecorateInfiniteQuery,
  DecorateMutation,
  DecorateQuery,
  ExtractPaginatedItem,
  FnMeta,
  InfiniteQueryInput,
  InfiniteQueryOptsParam,
  Meta,
  PaginatedFnMeta,
  VanillaAction,
  VanillaCRPCClient,
  VanillaMutation,
  VanillaQuery,
} from '../crpc/types';
// Re-export shared types from crpc/types (direct re-exports)
export { FUNC_REF_SYMBOL } from '../crpc/types';

// ============================================================================
// Reserved Options (SolidJS uses same underlying query-core)
// ============================================================================

type ReservedQueryOptions = 'queryKey' | 'queryFn' | 'staleTime';
type ReservedMutationOptions = 'mutationFn';

// ============================================================================
// Solid Decorator Types
// ============================================================================

type EmptyObject = Record<string, never>;

/** Solid query options parameter (uses SolidQueryOptions from solid-query) */
type SolidQueryOptsParam<T extends FunctionReference<'query'>> = Simplify<
  ConvexQueryHookOptions &
    DistributiveOmit<
      SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
      ReservedQueryOptions
    >
>;

/** Solid query options return type */
type SolidQueryOptsReturn<T extends FunctionReference<'query'>> =
  ConvexQueryOptions<T> & { meta: ConvexQueryMeta };

/** Solid action query options parameter */
type SolidActionQueryOptsParam<T extends FunctionReference<'action'>> =
  DistributiveOmit<
    SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
    ReservedQueryOptions
  >;

/** Solid action query options return type */
type SolidActionQueryOptsReturn<T extends FunctionReference<'action'>> =
  ConvexActionOptions<T>;

/** Static query options parameter (non-reactive, for event handlers) */
type StaticQueryOptsParam = { skipUnauth?: boolean };

/**
 * Solid-specific decorated query procedure.
 * Uses SolidQueryOptions from @tanstack/solid-query instead of QueryObserverOptions.
 */
export type SolidDecorateQuery<T extends FunctionReference<'query'>> = {
  queryOptions: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject | SkipToken,
        opts?: SolidQueryOptsParam<T>
      ) => SolidQueryOptsReturn<T>
    : EmptyObject extends FunctionArgs<T>
      ? (
          args?: FunctionArgs<T> | SkipToken,
          opts?: SolidQueryOptsParam<T>
        ) => SolidQueryOptsReturn<T>
      : (
          args: FunctionArgs<T> | SkipToken,
          opts?: SolidQueryOptsParam<T>
        ) => SolidQueryOptsReturn<T>;
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
  queryKey: (args?: DeepPartial<FunctionArgs<T>>) => ConvexQueryKey<T>;
  queryFilter: (
    args?: DeepPartial<FunctionArgs<T>>,
    filters?: DistributiveOmit<QueryFilters, 'queryKey'>
  ) => QueryFilters;
};

/** Mutation variables type */
type MutationVariables<T extends FunctionReference<'mutation' | 'action'>> =
  keyof FunctionArgs<T> extends never
    ? // biome-ignore lint/suspicious/noConfusingVoidType: TanStack Query requires void for optional variables
      void
    : EmptyObject extends FunctionArgs<T>
      ? FunctionArgs<T> | undefined
      : FunctionArgs<T>;

/**
 * Solid-specific decorated mutation procedure.
 * Uses SolidMutationOptions from @tanstack/solid-query.
 */
export type SolidDecorateMutation<T extends FunctionReference<'mutation'>> = {
  mutationOptions: (
    opts?: DistributiveOmit<
      SolidMutationOptions<
        FunctionReturnType<T>,
        DefaultError,
        MutationVariables<T>
      >,
      ReservedMutationOptions
    >
  ) => MutationObserverOptions<
    FunctionReturnType<T>,
    DefaultError,
    MutationVariables<T>
  >;
  mutationKey: () => ConvexMutationKey;
};

/**
 * Solid-specific decorated action procedure.
 */
export type SolidDecorateAction<T extends FunctionReference<'action'>> = {
  queryOptions: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject | SkipToken,
        opts?: SolidActionQueryOptsParam<T>
      ) => SolidActionQueryOptsReturn<T>
    : EmptyObject extends FunctionArgs<T>
      ? (
          args?: FunctionArgs<T> | SkipToken,
          opts?: SolidActionQueryOptsParam<T>
        ) => SolidActionQueryOptsReturn<T>
      : (
          args: FunctionArgs<T> | SkipToken,
          opts?: SolidActionQueryOptsParam<T>
        ) => SolidActionQueryOptsReturn<T>;
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
  mutationOptions: (
    opts?: DistributiveOmit<
      SolidMutationOptions<
        FunctionReturnType<T>,
        DefaultError,
        MutationVariables<T>
      >,
      ReservedMutationOptions
    >
  ) => MutationObserverOptions<
    FunctionReturnType<T>,
    DefaultError,
    MutationVariables<T>
  >;
  mutationKey: () => ConvexMutationKey;
  queryKey: (args?: DeepPartial<FunctionArgs<T>>) => ConvexActionKey<T>;
  queryFilter: (
    args?: DeepPartial<FunctionArgs<T>>,
    filters?: DistributiveOmit<QueryFilters, 'queryKey'>
  ) => QueryFilters;
};

/**
 * Solid-specific decorated infinite query procedure.
 */

type SolidInfiniteQueryOptsParam<
  T extends FunctionReference<'query'> = FunctionReference<'query'>,
> = {
  limit?: number;
  skipUnauth?: boolean;
  placeholderData?: ExtractPaginatedItem<FunctionReturnType<T>>[];
} & DistributiveOmit<
  SolidQueryOptions<FunctionReturnType<T>, DefaultError>,
  | 'queryKey'
  | 'queryFn'
  | 'staleTime'
  | 'refetchInterval'
  | 'refetchOnMount'
  | 'refetchOnReconnect'
  | 'refetchOnWindowFocus'
  | 'persister'
  | 'placeholderData'
>;

type SolidInfiniteQueryOptsReturn<T extends FunctionReference<'query'>> =
  ConvexInfiniteQueryOptionsWithRef<T>;

export type SolidDecorateInfiniteQuery<T extends FunctionReference<'query'>> = {
  infiniteQueryOptions: keyof InfiniteQueryInput<FunctionArgs<T>> extends never
    ? (
        args?: EmptyObject | SkipToken,
        opts?: SolidInfiniteQueryOptsParam<T>
      ) => SolidInfiniteQueryOptsReturn<T>
    : EmptyObject extends InfiniteQueryInput<FunctionArgs<T>>
      ? (
          args?: InfiniteQueryInput<FunctionArgs<T>> | SkipToken,
          opts?: SolidInfiniteQueryOptsParam<T>
        ) => SolidInfiniteQueryOptsReturn<T>
      : (
          args: InfiniteQueryInput<FunctionArgs<T>> | SkipToken,
          opts?: SolidInfiniteQueryOptsParam<T>
        ) => SolidInfiniteQueryOptsReturn<T>;
  infiniteQueryKey: (
    args?: DeepPartial<InfiniteQueryInput<FunctionArgs<T>>>
  ) => ConvexQueryKey<T>;
  meta: PaginatedFnMeta;
};

// ============================================================================
// Check if type is paginated (has cursor key)
// ============================================================================

type IsPaginated<T> = 'cursor' extends keyof T ? true : false;

// ============================================================================
// Solid CRPC Client (recursive type)
// ============================================================================

/**
 * Recursively decorates all procedures in a Convex API object for SolidJS.
 */
export type SolidCRPCClient<TApi> = {
  [K in keyof TApi as K extends string
    ? K extends `_${string}`
      ? never
      : K
    : K]: TApi[K] extends FunctionReference<'query'>
    ? IsPaginated<FunctionArgs<TApi[K]>> extends true
      ? SolidDecorateQuery<TApi[K]> & SolidDecorateInfiniteQuery<TApi[K]>
      : SolidDecorateQuery<TApi[K]>
    : TApi[K] extends FunctionReference<'mutation'>
      ? SolidDecorateMutation<TApi[K]>
      : TApi[K] extends FunctionReference<'action'>
        ? SolidDecorateAction<TApi[K]>
        : TApi[K] extends Record<string, unknown>
          ? SolidCRPCClient<TApi[K]>
          : never;
};
