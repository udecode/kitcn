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
import type { DistributiveOmit } from '../internal/types';
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
} & DistributiveOmit<
  UseQueryOptions<TItem[], DefaultError>,
  ReservedInfiniteOptions
>;

/**
 * Pagination state persisted in queryClient.
 * Enables scroll restoration when navigating back to a paginated list.
 *
 * Uses flat { cursor, limit } structure like tRPC.
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
        limit?: number;
        /** Internal pagination ID for subscription management */
        __paginationId?: number;
      };
      endCursor?: string | null;
    }
  >;
  version: number;
  /** Recovery key to prevent infinite recovery loops */
  autoRecoveryAttempted?: string;
};

// Query key prefix for pagination state storage
const PAGINATION_KEY_PREFIX = '__pagination__' as const;

// Pagination ID store - persists across mounts for cache reuse
// Key: query name + args, Value: pagination ID
const paginationIdStore = new Map<string, number>();
let paginationIdCounter = 0;

const getOrCreatePaginationId = (storeKey: string): number => {
  const existing = paginationIdStore.get(storeKey);
  if (existing !== undefined) {
    return existing;
  }

  const newId = ++paginationIdCounter;
  paginationIdStore.set(storeKey, newId);
  return newId;
};

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
    limit?: number;
    /** Internal pagination ID for subscription management */
    __paginationId?: number;
  };
  endCursor?: string | null; // For page splitting - the cursor where this page ends
};

// Page splitting: when a page gets too large, Convex may return splitCursor
// - SplitRecommended: page is large, should split on next render
// - SplitRequired: page MUST be split (too large to return)
type PageResultWithSplit<T> = PaginationResult<T> & {
  splitCursor?: string | null;
};

/** Build a unique key for recovery attempt detection */
const buildRecoveryKey = (
  pageKeys: number[],
  page0Cursor: string | null,
  page0UpdatedAt: number
): string => JSON.stringify({ pageKeys, page0Cursor, page0UpdatedAt });

type UseStaleCursorRecoveryOptions = {
  argsObject: Record<string, unknown>;
  combined: {
    _rawResults: Array<{
      data?: unknown;
      dataUpdatedAt?: number;
      isError?: boolean;
      isFetching?: boolean;
      refetch: () => void;
    }>;
    isFetchNextPageError: boolean;
    status: string;
  };
  limit?: number;
  setState: (
    updater: PaginationState | ((prev: PaginationState) => PaginationState)
  ) => void;
  state: PaginationState;
};

/**
 * Hook for auto-recovering from stale cursors after WebSocket reconnection.
 *
 * When Convex WebSocket reconnects, page 0 (cursor: null) resubscribes and
 * gets fresh data. However, pages 1+ may have stale cursors that fail.
 *
 * This hook detects this pattern and creates a recovery page that fetches
 * enough items to cover the lost pages, preserving the user's scroll position.
 */
const useStaleCursorRecovery = ({
  argsObject,
  combined,
  limit,
  setState,
  state,
}: UseStaleCursorRecoveryOptions): void => {
  // Auto-recovery from stale cursors
  // Triggers when: page 0 OK + pages 1+ errored + page 0 has continueCursor
  useEffect(() => {
    if (!combined.isFetchNextPageError) return;

    const page0Result = combined._rawResults[0];
    const page0Data = page0Result?.data as
      | PaginationResult<unknown>
      | undefined;
    const page0UpdatedAt = page0Result?.dataUpdatedAt ?? 0;

    const hasPage0Data = page0Data !== undefined && !page0Result?.isError;
    const hasSubsequentErrors = combined._rawResults
      .slice(1)
      .some((q) => q?.isError && !q?.isFetching);

    if (!hasPage0Data || !hasSubsequentErrors || !page0Data?.continueCursor)
      return;

    const recoveryKey = buildRecoveryKey(
      state.pageKeys,
      page0Data.continueCursor,
      page0UpdatedAt
    );

    if (state.autoRecoveryAttempted === recoveryKey) return;

    const erroredPageKeys = state.pageKeys.filter(
      (_, i) => i > 0 && combined._rawResults[i]?.isError
    );
    const itemsToRecover = erroredPageKeys.reduce((sum, key) => {
      const pageLimit = state.queries[key]?.args?.limit ?? limit ?? 20;
      return sum + pageLimit;
    }, 0);

    console.warn('[Pagination] Auto-recovering from stale cursors', {
      erroredPages: erroredPageKeys.length,
      itemsToRecover,
    });

    setState((prev) => ({
      ...prev,
      id: prev.id,
      nextPageKey: 2,
      pageKeys: [prev.pageKeys[0], 1],
      queries: {
        [prev.pageKeys[0]]: prev.queries[prev.pageKeys[0]],
        1: {
          args: {
            ...argsObject,
            cursor: page0Data.continueCursor,
            limit: Math.min(itemsToRecover + (limit ?? 20), 500),
            __paginationId: prev.id,
          },
        },
      },
      version: prev.version + 1,
      autoRecoveryAttempted: recoveryKey,
    }));
  }, [
    combined.isFetchNextPageError,
    combined._rawResults,
    state.pageKeys,
    state.queries,
    state.autoRecoveryAttempted,
    argsObject,
    limit,
    setState,
  ]);

  // Clear recovery flag on success
  useEffect(() => {
    if (
      (combined.status === 'CanLoadMore' || combined.status === 'Exhausted') &&
      state.autoRecoveryAttempted
    ) {
      setState((prev) => ({
        ...prev,
        autoRecoveryAttempted: undefined,
      }));
    }
  }, [combined.status, state.autoRecoveryAttempted, setState]);
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
  const { limit, enabled, placeholderData, ...queryOptions } = options;

  const { isLoading: isAuthLoading } = useSafeConvexAuth();
  const meta = useMeta();
  const queryClient = useQueryClient();

  // Look up server-prefetched data using server-compatible queryKey
  // Server key: ['convexQuery', funcName, { ...args, cursor: null, limit }]
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

  // Don't skip if we have prefetched data - use it for instant hydration
  // Prefetched data bypasses both auth loading AND explicit disabled
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

  // Stable store key for pagination ID persistence across mounts
  const storeKey = useMemo(
    () => JSON.stringify({ query: getFunctionName(query), args: argsObject }),
    [query, argsObject]
  );

  // Helper to create initial state
  const createInitialState = useCallback((): PaginationState => {
    const id = getOrCreatePaginationId(storeKey);
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
  }, [storeKey, skip, argsObject, limit]);

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
          enabled: !skip && !!state.queries[key],
          structuralSharing: false,
          // Apply TanStack Query options to all pages
          ...(queryOptions ?? {}),
          // Use server-prefetched data for first page (hydration)
          ...(index === 0 && prefetchedFirstPage
            ? { initialData: prefetchedFirstPage }
            : {}),
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
      meta,
      queryOptions,
      prefetchedFirstPage,
      placeholderData,
    ]
  );

  // Use combine to aggregate all page states in one place
  const combined = useQueries({
    queries: tanstackQueries as any,
    combine: (results) => {
      // Aggregate pages with deduplication
      const allItems: PaginatedQueryItem<Query>[] = [];
      const pages: PaginatedQueryItem<Query>[][] = [];
      const seenIds = new Set<string>();
      let lastPage: PageResultWithSplit<PaginatedQueryItem<Query>> | undefined;
      let paginationStatus: PaginationStatus = 'LoadingFirstPage';

      for (let i = 0; i < results.length; i++) {
        const pageQuery = results[i];
        if (pageQuery.isLoading || pageQuery.data === undefined) {
          paginationStatus = i === 0 ? 'LoadingFirstPage' : 'LoadingMore';
          break;
        }
        const page = pageQuery.data as PageResultWithSplit<
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
        isFetchNextPageError:
          results.length > 1 && (results.at(-1)?.isError ?? false),
        // Override with placeholder-aware values
        isPlaceholderData,
        isRefetching: isFetching && allItems.length > 0 && !isPlaceholderData,
        // Keep raw results for effects (InvalidCursor detection, page splitting)
        _rawResults: results,
      };
    },
  });

  // Auto-recovery from stale cursors after WebSocket reconnection
  useStaleCursorRecovery({
    argsObject,
    combined,
    limit,
    setState,
    state,
  });

  // Handle page splitting - when a page returns splitCursor, we need to split it
  useEffect(() => {
    for (let i = 0; i < combined._rawResults.length; i++) {
      const pageQuery = combined._rawResults[i];
      if (pageQuery.data) {
        const page = pageQuery.data as PageResultWithSplit<
          PaginatedQueryItem<Query>
        >;
        const pageKey = state.pageKeys[i];
        const pageState = state.queries[pageKey];

        // Check if this page needs splitting and we haven't already split it
        if (page.splitCursor && pageState && !pageState.endCursor) {
          setState((prev) => {
            const currentPageState = prev.queries[pageKey];
            if (!currentPageState || currentPageState.endCursor) return prev;

            const newKey = prev.nextPageKey;
            const splitCursor = page.splitCursor!; // Checked above: page.splitCursor is truthy
            const splitPageArgs = {
              ...argsObject,
              cursor: splitCursor,
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
                  endCursor: splitCursor,
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

  // Omit internal fields from combined
  const { _rawResults, lastPage, ...result } = combined;

  const hasNextPage = combined.status === 'CanLoadMore';
  const isFetchingNextPage = combined.status === 'LoadingMore';

  return {
    ...result,
    failureReason: combined.failureReason as Error | null,
    // Override/add custom fields
    error: combined.error instanceof Error ? combined.error : null,
    fetchNextPage: (n?: number) => loadMore(n ?? limit),
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

  const result = useInfiniteQueryInternal(query as any, args as any, {
    limit,
    ...(queryOptions as any),
    // Internal hook handles prefetch detection and will bypass skip if data exists
    enabled: !shouldSkip,
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
