/** biome-ignore-all lint/suspicious/noExplicitAny: Convex query/mutation type compatibility */

import {
  type DefaultError,
  type UseQueryOptions,
  type UseQueryResult,
  useQueries,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  PaginatedQueryArgs,
  PaginatedQueryItem,
  PaginatedQueryReference,
} from 'convex/react';
import {
  type FunctionReference,
  type FunctionReturnType,
  getFunctionName,
  type PaginationResult,
} from 'convex/server';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CRPCClientError, isCRPCClientError } from '../crpc/error';
import { convexQuery } from '../crpc/query-options';
import { type ExtractPaginatedItem, FUNC_REF_SYMBOL } from '../crpc/types';
import { resolveEnabled } from '../internal/enabled';
import {
  isInvalidPaginationCursor,
  shouldSplitPaginationPage,
} from '../internal/pagination';
import type { DistributiveOmit } from '../internal/types';
import { useStableIdentity } from '../internal/use-stable-identity';
import { useAuthValue, useSafeConvexAuth } from './auth-store';
import { useMeta } from './context';
import type { ConvexInfiniteQueryOptionsWithRef } from './crpc-types';

/** Reserved options controlled by infinite query hooks */
type ReservedInfiniteOptions =
  | 'queryKey'
  | 'queryFn'
  | 'staleTime'
  | 'refetchInterval'
  | 'refetchOnMount'
  | 'refetchOnReconnect'
  | 'refetchOnWindowFocus';

/** Base options for infinite query internal hook */
type InfiniteQueryOptions<TItem> = {
  limit?: number;
  /** Auth binding of the paginated function, from the caller's cRPC meta. */
  authType?: 'optional' | 'required';
} & DistributiveOmit<
  UseQueryOptions<TItem[], DefaultError>,
  ReservedInfiniteOptions
>;

/**
 * Pagination state persisted in queryClient.
 * Enables scroll restoration when navigating back to a paginated list.
 *
 * Uses flat { cursor, endCursor, limit } structure like tRPC.
 */
export type PaginationState = {
  id: number;
  nextPageKey: number;
  pageKeys: number[];
  queries: Record<
    number,
    {
      /** Flat pagination args - tRPC style */
      args: Record<string, unknown> & {
        cursor: string | null;
        endCursor?: string | null;
        limit?: number;
        /** Internal pagination ID for subscription management */
        __paginationId?: number;
      };
    }
  >;
  version: number;
};

// Query key prefix for pagination state storage
const PAGINATION_KEY_PREFIX = '__pagination__' as const;

let paginationIdCounter = 0;

const createPaginationId = (): number => ++paginationIdCounter;

export type PaginationStatus =
  | 'CanLoadMore'
  | 'Exhausted'
  | 'LoadingFirstPage'
  | 'LoadingMore';

/** Fields we override or omit from TanStack Query's UseQueryResult */
type OverriddenFields = 'data' | 'promise' | 'refetch' | 'status';

/** Return type for infinite query hooks - extends TanStack Query's UseQueryResult */
export type UseInfiniteQueryResult<T> = Omit<
  UseQueryResult<T[], Error>,
  OverriddenFields
> & {
  /** Flattened array of all loaded items */
  data: T[];
  /** Fetch the next page */
  fetchNextPage: (limit?: number) => void;
  /** Whether the query has a next page */
  hasNextPage: boolean;
  /** Whether fetching next page failed */
  isFetchNextPageError: boolean;
  /** Whether the query is fetching the next page */
  isFetchingNextPage: boolean;
  /** Array of page arrays (raw, not flattened) */
  pages: T[][];
  /** Current pagination status */
  status: PaginationStatus;
};

type PageState = {
  /** Flat pagination args - tRPC style */
  args: Record<string, unknown> & {
    cursor: string | null;
    endCursor?: string | null;
    limit?: number;
    /** Internal pagination ID for subscription management */
    __paginationId?: number;
  };
};

type UseStaleCursorRecoveryOptions = {
  combined: {
    _rawResults: Array<{
      error?: unknown;
      isError?: boolean;
      isFetching?: boolean;
    }>;
    isFetchNextPageError: boolean;
  };
  resetPagination: () => void;
};

/**
 * Hook for auto-recovering from stale cursors after WebSocket reconnection.
 *
 * When Convex WebSocket reconnects, page 0 (cursor: null) resubscribes and
 * gets fresh data. However, pages 1+ may have stale cursors that fail.
 *
 * This hook discards the invalid cursor chain and restarts from page one.
 */
const useStaleCursorRecovery = ({
  combined,
  resetPagination,
}: UseStaleCursorRecoveryOptions): void => {
  useEffect(() => {
    if (!combined.isFetchNextPageError) return;

    const hasInvalidCursor = combined._rawResults
      .slice(1)
      .some(
        (result) =>
          result?.isError &&
          !result.isFetching &&
          isInvalidPaginationCursor(result.error)
      );
    if (hasInvalidCursor) resetPagination();
  }, [combined.isFetchNextPageError, combined._rawResults, resetPagination]);
};

/**
 * Internal infinite query hook using TanStack Query + convexQuery.
 * Each page gets:
 * - Convex WebSocket subscription (real-time reactivity)
 * - TanStack Query retry on timeout errors
 *
 * Use `useInfiniteQuery` for the public API with auth handling.
 */
const useInfiniteQueryInternal = <Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query>,
  options: InfiniteQueryOptions<PaginatedQueryItem<Query>>
): UseInfiniteQueryResult<PaginatedQueryItem<Query>> => {
  // Extract our custom options, the rest are TanStack Query options for page queries
  const { limit, authType, enabled, placeholderData, ...forwardedOptions } =
    options;

  // The public hook rebuilds `options` as a fresh literal every render, so the
  // rest object churns even when the caller passed nothing. Latch it: without a
  // stable identity the `tanstackQueries` memo below can never hit, and each
  // miss re-hashes one Convex arg object per loaded page.
  const queryOptions = useStableIdentity(forwardedOptions);

  const { isLoading: isAuthLoading } = useSafeConvexAuth();
  const meta = useMeta();
  const queryClient = useQueryClient();
  const authEpoch = useAuthValue('authEpoch');

  // Look up server-prefetched data using server-compatible queryKey
  // Server key: ['convexQuery', funcName, { ...args, cursor: null, limit }]
  // This is a mount-time gate only ("did the server give us page 0?"), never
  // page 0's `initialData`: the prefetch is written under page 0's own query
  // key, so TanStack already serves it, while `initialData` would additionally
  // freeze it into the query's `initialState` — where an identity transition
  // resurrects the previous account's page.
  const prefetchedFirstPage = useMemo(() => {
    const serverQueryKey = [
      'convexQuery',
      getFunctionName(query),
      {
        ...(args as Record<string, unknown>),
        cursor: null,
        limit,
      },
    ];
    const data = queryClient.getQueryData(serverQueryKey);
    return data ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, JSON.stringify(args), limit, queryClient]);

  // Build the first page when prefetched data exists so it can hydrate while
  // auth is loading. The page-level enabled gate still blocks network work.
  const skip = !prefetchedFirstPage && (isAuthLoading || enabled === false);

  // Helper to get/set pagination state from queryClient with gcTime: Infinity
  const getPaginationState = useCallback(
    (key: string): PaginationState | undefined => {
      const queryKey = [PAGINATION_KEY_PREFIX, key] as const;
      const state = queryClient.getQueryData<PaginationState>(queryKey);
      return state;
    },
    [queryClient]
  );
  const setPaginationState = useCallback(
    (key: string, state: PaginationState) => {
      const queryKey = [PAGINATION_KEY_PREFIX, key] as const;
      queryClient.setQueryData<PaginationState>(queryKey, state);
    },
    [queryClient]
  );
  const argsObject = useMemo(
    () => (skip ? {} : args) as Record<string, unknown>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skip, JSON.stringify(args)]
  );

  // Stable store key for pagination ID persistence across mounts.
  // Cursors index into one account's result set, so an auth-bound list carries
  // the account generation: a transition re-keys it, which routes the hook
  // through its existing "args changed" reset instead of restoring the previous
  // account's page chain and paging from its cursors.
  const storeKey = useMemo(
    () =>
      JSON.stringify({
        query: getFunctionName(query),
        args: argsObject,
        ...(authType ? { authEpoch } : {}),
      }),
    [query, argsObject, authType, authEpoch]
  );

  // Helper to create initial state
  const createInitialState = useCallback((): PaginationState => {
    const id = createPaginationId();
    return {
      id,
      nextPageKey: 1,
      pageKeys: skip ? [] : [0],
      queries: skip
        ? {}
        : {
            0: {
              args: {
                ...argsObject,
                cursor: null,
                limit,
                __paginationId: id,
              },
            },
          },
      version: 0,
    };
  }, [skip, argsObject, limit]);

  // Track previous args to detect changes (in effect, not during render)
  const prevArgsRef = useRef<{ storeKey: string; skip: boolean } | null>(null);

  // State: tracks pages with cursors (mirrors Convex's usePaginatedQuery)
  // Check queryClient first for state persistence across navigations
  const [state, setLocalState] = useState<PaginationState>(() => {
    if (skip) {
      return { id: 0, nextPageKey: 1, pageKeys: [], queries: {}, version: 0 };
    }
    // Try to restore from queryClient (enables scroll restoration)
    const existingState = getPaginationState(storeKey);
    if (existingState) {
      return existingState;
    }
    const initial = createInitialState();
    return initial;
  });

  // Sync state changes to queryClient for persistence across navigations
  const setState = useCallback(
    (
      updater: PaginationState | ((prev: PaginationState) => PaginationState)
    ) => {
      setLocalState((prev) => {
        const newState =
          typeof updater === 'function' ? updater(prev) : updater;
        setPaginationState(storeKey, newState);
        return newState;
      });
    },
    [storeKey, setPaginationState]
  );

  // Handle initialization and args changes
  // This effect initializes state when skip becomes false, or resets when args change
  useEffect(() => {
    const prev = prevArgsRef.current;
    const isFirstRun = prev === null;
    const argsChanged =
      prev !== null && (prev.storeKey !== storeKey || prev.skip !== skip);
    const skipBecameFalse = prev?.skip && !skip;

    // Update ref for next render

    prevArgsRef.current = { storeKey, skip };

    // Skip state - don't initialize
    if (skip) {
      return;
    }

    // First run with skip=false: state was initialized in useState, sync to queryClient
    if (isFirstRun) {
      setPaginationState(storeKey, state);
      return;
    }

    // Skip just became false (auth loaded): initialize state
    if (skipBecameFalse) {
      // Try to restore from queryClient first
      const existingState = getPaginationState(storeKey);
      if (existingState) {
        setLocalState(existingState);
        return;
      }
      // Create new initial state
      const newState = createInitialState();
      setLocalState(newState);
      setPaginationState(storeKey, newState);
      return;
    }

    // Args changed (different query/args): reset state
    if (argsChanged) {
      // Try to restore from queryClient first (for back navigation)
      const existingState = getPaginationState(storeKey);
      if (existingState) {
        setLocalState(existingState);
        return;
      }
      // Create new initial state
      const newState = createInitialState();
      setLocalState(newState);
      setPaginationState(storeKey, newState);
    }
  }, [
    skip,
    storeKey,
    state,
    createInitialState,
    getPaginationState,
    setPaginationState,
  ]);

  // Build TanStack queries from state (each page = separate convexQuery)
  // structuralSharing: false ensures Convex WebSocket updates trigger re-renders
  const tanstackQueries = useMemo(
    () =>
      state.pageKeys.map((key, index) => {
        // Strip internal __paginationId before passing to Convex
        const pageArgs = state.queries[key]?.args;
        const convexArgs = pageArgs
          ? (({ __paginationId, ...rest }) => rest)(pageArgs)
          : 'skip';

        return {
          ...convexQuery(query, convexArgs as any, meta),
          // Resolve the caller's `enabled` here so a predicate is evaluated
          // per page instead of being collapsed into a boolean upstream.
          enabled: resolveEnabled(
            !skip && !!state.queries[key] && (!authType || !isAuthLoading),
            enabled
          ),
          structuralSharing: false,
          // Apply TanStack Query options to all pages
          ...(queryOptions ?? {}),
          // Use placeholder data for first page (wrapped in pagination format)
          ...(index === 0 && placeholderData
            ? {
                placeholderData: {
                  page: placeholderData,
                  isDone: false,
                  continueCursor: null,
                },
              }
            : {}),
        };
      }),
    [
      query,
      state.pageKeys,
      state.queries,
      skip,
      enabled,
      meta,
      queryOptions,
      placeholderData,
      authType,
      isAuthLoading,
    ]
  );

  // Aggregate all page states in one place.
  // `combine` must be stable: QueriesObserver re-runs it whenever its identity
  // changes, and the body is O(total loaded items). Its only render-scope
  // capture is `placeholderData`.
  const combine = useCallback(
    (results: any[]) => {
      // Aggregate pages with deduplication
      const allItems: PaginatedQueryItem<Query>[] = [];
      const pages: PaginatedQueryItem<Query>[][] = [];
      const seenIds = new Set<string>();
      let lastPage: PaginationResult<PaginatedQueryItem<Query>> | undefined;
      let paginationStatus: PaginationStatus = 'LoadingFirstPage';

      for (let i = 0; i < results.length; i++) {
        const pageQuery = results[i];
        if (pageQuery.isLoading || pageQuery.data === undefined) {
          paginationStatus = i === 0 ? 'LoadingFirstPage' : 'LoadingMore';
          break;
        }
        const page = pageQuery.data as PaginationResult<
          PaginatedQueryItem<Query>
        >;
        lastPage = page;
        pages.push(page.page);
        for (const item of page.page) {
          const id =
            (item as { _id?: string })._id || (item as { id?: string }).id;
          if (id && seenIds.has(id)) continue;
          if (id) seenIds.add(id);
          allItems.push(item);
        }
        paginationStatus = page.isDone ? 'Exhausted' : 'CanLoadMore';
      }

      // Computed values for overrides
      const isPlaceholderData =
        results[0]?.isPlaceholderData ?? !!placeholderData;
      const isFetching = results.some((r) => r.isFetching);
      // Use latest dataUpdatedAt across all pages
      const dataUpdatedAt = Math.max(
        ...results.map((r) => r.dataUpdatedAt ?? 0)
      );

      // Get first result for base TanStack Query fields (with safe defaults)
      const firstResult = results[0];

      return {
        // Spread all TanStack Query fields from first result
        ...(firstResult ?? {}),
        // Aggregated/overridden fields
        data: allItems,
        dataUpdatedAt,
        lastPage,
        pages,
        status: paginationStatus,
        // Aggregate errors across all pages
        error: results.find((r) => r.isError)?.error ?? null,
        isError: results.some((r) => r.isError),
        // Aggregate fetching across all pages
        isFetching,
        isFetchNextPageError: results.slice(1).some((result) => result.isError),
        // Override with placeholder-aware values
        isPlaceholderData,
        isRefetching: isFetching && allItems.length > 0 && !isPlaceholderData,
        // Keep raw results for effects (InvalidCursor detection, page splitting)
        _rawResults: results,
      };
    },
    [placeholderData]
  );

  const combined = useQueries({
    queries: tanstackQueries as any,
    combine,
  });

  const resetPagination = useCallback(
    () => setState(createInitialState()),
    [createInitialState, setState]
  );

  // Auto-recovery from stale cursors after WebSocket reconnection
  useStaleCursorRecovery({
    combined,
    resetPagination,
  });

  // Split when Convex requests it or a reactive page outgrows its target size.
  useEffect(() => {
    for (let i = 0; i < combined._rawResults.length; i++) {
      const pageQuery = combined._rawResults[i];
      if (pageQuery.data) {
        const page = pageQuery.data as PaginationResult<
          PaginatedQueryItem<Query>
        >;
        const pageKey = state.pageKeys[i];
        const pageState = state.queries[pageKey];

        // Check if this page needs splitting and we haven't already split it
        if (
          shouldSplitPaginationPage(page, limit) &&
          pageState &&
          pageState.args.endCursor !== page.splitCursor
        ) {
          setState((prev) => {
            const currentPageState = prev.queries[pageKey];
            if (
              !currentPageState ||
              currentPageState.args.endCursor === page.splitCursor
            )
              return prev;

            const newKey = prev.nextPageKey;
            const splitCursor = page.splitCursor;
            const endCursor =
              currentPageState.args.endCursor ?? page.continueCursor;
            const splitPageArgs = {
              ...argsObject,
              cursor: splitCursor,
              endCursor,
              limit: currentPageState.args.limit,
              __paginationId: prev.id,
            };

            // Insert new page after the split page
            const pageKeyIndex = prev.pageKeys.indexOf(pageKey);
            const newPageKeys = [...prev.pageKeys];
            newPageKeys.splice(pageKeyIndex + 1, 0, newKey);

            return {
              ...prev,
              nextPageKey: newKey + 1,
              pageKeys: newPageKeys,
              queries: {
                ...prev.queries,
                // Mark current page with its end cursor
                [pageKey]: {
                  ...currentPageState,
                  args: {
                    ...currentPageState.args,
                    endCursor: splitCursor,
                  },
                },
                // Add the new split page
                [newKey]: {
                  args: splitPageArgs,
                },
              } as Record<number, PageState>,
            };
          });
          return; // Only handle one split per render
        }
      }
    }
  }, [
    combined._rawResults,
    state.pageKeys,
    state.queries,
    argsObject,
    limit,
    setState,
  ]);

  // loadMore: add new page to state
  const loadMore = useCallback(
    (pageLimit?: number) => {
      if (
        combined.status !== 'CanLoadMore' ||
        !combined.lastPage?.continueCursor
      ) {
        return;
      }

      setState((prev) => {
        const newKey = prev.nextPageKey;
        return {
          ...prev,
          nextPageKey: newKey + 1,
          pageKeys: [...prev.pageKeys, newKey],
          queries: {
            ...prev.queries,
            [newKey]: {
              args: {
                ...argsObject,
                cursor: combined.lastPage!.continueCursor,
                limit: pageLimit,
                __paginationId: prev.id,
              },
            },
          },
        };
      });
    },
    [combined.status, combined.lastPage, setState, argsObject]
  );

  // `fetchNextPage` is documented as safe to key an effect on (infinite-scroll
  // sentinels), so it needs permanent identity. `loadMore` itself is rebuilt on
  // every Convex push because page queries opt out of structural sharing, so
  // latch it behind a ref instead of forwarding its identity.
  const loadMoreRef = useRef(loadMore);
  const limitRef = useRef(limit);

  useEffect(() => {
    loadMoreRef.current = loadMore;
    limitRef.current = limit;
  }, [loadMore, limit]);

  const fetchNextPage = useCallback(
    (n?: number) => loadMoreRef.current(n ?? limitRef.current),
    []
  );

  // Omit internal fields from combined
  const { _rawResults, lastPage, ...result } = combined;

  const hasNextPage = combined.status === 'CanLoadMore';
  const isFetchingNextPage = combined.status === 'LoadingMore';

  return {
    ...result,
    failureReason: combined.failureReason as Error | null,
    // Override/add custom fields
    error: combined.error instanceof Error ? combined.error : null,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
};

/**
 * Infinite query hook using cRPC-style options.
 * Accepts options from `crpc.posts.list.infiniteQueryOptions()`.
 *
 * @example
 * ```tsx
 * const crpc = useCRPC();
 * const { data, fetchNextPage } = useInfiniteQuery(
 *   crpc.posts.list.infiniteQueryOptions({ userId }, { limit: 20 })
 * );
 * ```
 */
export function useInfiniteQuery<
  T extends FunctionReference<'query'>,
  TItem = ExtractPaginatedItem<FunctionReturnType<T>>,
>(
  infiniteOptions: ConvexInfiniteQueryOptionsWithRef<T>
): UseInfiniteQueryResult<TItem> {
  // Extract function reference from Symbol (attached by proxy)
  const query = infiniteOptions[FUNC_REF_SYMBOL];
  const onQueryUnauthorized = useAuthValue('onQueryUnauthorized');
  const { isLoading: isAuthLoading, isAuthenticated } = useSafeConvexAuth();

  // Extract metadata and query options from infiniteOptions
  const {
    queryKey: _queryKey,
    staleTime: _staleTime,
    refetchInterval: _refetchInterval,
    refetchOnMount: _refetchOnMount,
    refetchOnReconnect: _refetchOnReconnect,
    refetchOnWindowFocus: _refetchOnWindowFocus,
    enabled: factoryEnabled,
    meta,
    ...queryOptions
  } = infiniteOptions;
  const { queryName, args, limit, authType, skipUnauth } = meta;

  // Default skipUnauth to false (throws CRPCClientError)
  const skipUnauthFinal = skipUnauth ?? false;

  // Auth required but user not authenticated (after auth loads)
  // Note: Don't check factoryEnabled here - it may be false due to auth skip
  const isUnauthorized =
    authType === 'required' && !isAuthLoading && !isAuthenticated;

  // Determine if we should skip the query
  // Only wait for auth loading on required queries (not optional/public)
  const shouldSkip =
    factoryEnabled === false ||
    (authType === 'required' && isAuthLoading) ||
    (authType === 'required' && !isAuthenticated);

  // Create error when unauthorized (unless skipUnauth)
  // Both cases skip query, but skipUnauth returns empty instead of error
  const authError = useMemo(() => {
    if (isUnauthorized && !skipUnauthFinal) {
      return new CRPCClientError({
        code: 'UNAUTHORIZED',
        functionName: queryName,
      });
    }
    return null;
  }, [isUnauthorized, skipUnauthFinal, queryName]);

  // Call callback in useEffect (not during render) to avoid setState-in-render
  useEffect(() => {
    if (isUnauthorized && !skipUnauthFinal) {
      onQueryUnauthorized({ queryName });
    }
  }, [isUnauthorized, skipUnauthFinal, queryName, onQueryUnauthorized]);

  // Internal hook handles prefetch detection and will bypass skip if data exists.
  // Forward a predicate untouched so the internal hook can resolve it per page.
  // Memoized because `resolveEnabled` allocates a fresh closure for predicates,
  // which would otherwise churn the page-queries memo on every render.
  const enabled = useMemo(
    () => resolveEnabled(!shouldSkip, factoryEnabled),
    [shouldSkip, factoryEnabled]
  );

  const result = useInfiniteQueryInternal(query as any, args as any, {
    authType,
    limit,
    ...(queryOptions as any),
    enabled,
  });

  // Include auth loading in loading state for optional and required types
  const authLoadingApplies = authType === 'optional' || authType === 'required';

  // Check if we got an auth error
  const isClientError = isCRPCClientError(result.error);

  // When skipUnauth + unauthorized: return empty data, not placeholder
  const isSkippedUnauth = isUnauthorized && skipUnauthFinal;

  return {
    ...result,
    data: isSkippedUnauth ? ([] as TItem[]) : (result.data as TItem[]),
    pages: isSkippedUnauth ? ([] as TItem[][]) : (result.pages as TItem[][]),
    // Override with auth error if present
    ...(authError && { error: authError, isError: true }),
    // skipUnauth + unauthorized: not loading, not placeholder
    ...(isSkippedUnauth && { isPlaceholderData: false }),
    isLoading:
      (authLoadingApplies && isAuthLoading) ||
      (!isClientError && !authError && !isSkippedUnauth && result.isLoading),
  };
}
