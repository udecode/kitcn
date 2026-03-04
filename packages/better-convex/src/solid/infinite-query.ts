/** biome-ignore-all lint/suspicious/noExplicitAny: Convex query/mutation type compatibility */

import { type QueryObserverResult, skipToken } from '@tanstack/query-core';
import { createQueries, useQueryClient } from '@tanstack/solid-query';
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
import { createEffect, createMemo, createSignal } from 'solid-js';

import { CRPCClientError, isCRPCClientError } from '../crpc/error';
import { convexQuery } from '../crpc/query-options';
import {
  type ConvexInfiniteQueryOptionsWithRef,
  type ExtractPaginatedItem,
  FUNC_REF_SYMBOL,
} from '../crpc/types';
import type { DistributiveOmit } from '../internal/types';
import { useAuthValue, useSafeConvexAuth } from './auth-store';
import { useMeta } from './context';

/** Reserved options controlled by infinite query hooks */
type ReservedInfiniteOptions =
  | 'queryKey'
  | 'queryFn'
  | 'staleTime'
  | 'refetchInterval'
  | 'refetchOnMount'
  | 'refetchOnReconnect'
  | 'refetchOnWindowFocus';

/** Base options for infinite query internal */
type InfiniteQueryOptions<TItem> = {
  limit?: number;
} & DistributiveOmit<
  { enabled?: boolean; placeholderData?: TItem[] },
  ReservedInfiniteOptions
>;

/**
 * Pagination state persisted in queryClient.
 * Enables scroll restoration when navigating back to a paginated list.
 */
export type PaginationState = {
  id: number;
  nextPageKey: number;
  pageKeys: number[];
  queries: Record<
    number,
    {
      args: Record<string, unknown> & {
        cursor: string | null;
        limit?: number;
        __paginationId?: number;
      };
      endCursor?: string | null;
    }
  >;
  version: number;
  autoRecoveryAttempted?: string;
};

const PAGINATION_KEY_PREFIX = '__pagination__' as const;

// Pagination ID store - persists across mounts for cache reuse
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

type OverriddenFields = 'data' | 'promise' | 'refetch' | 'status';

export type InfiniteQueryResult<T> = Omit<
  QueryObserverResult<T[], Error>,
  OverriddenFields
> & {
  data: T[];
  fetchNextPage: (limit?: number) => void;
  hasNextPage: boolean;
  isFetchNextPageError: boolean;
  isFetchingNextPage: boolean;
  pages: T[][];
  status: PaginationStatus;
};

type PageState = {
  args: Record<string, unknown> & {
    cursor: string | null;
    limit?: number;
    __paginationId?: number;
  };
  endCursor?: string | null;
};

type PageResultWithSplit<T> = PaginationResult<T> & {
  splitCursor?: string | null;
};

const buildRecoveryKey = (
  pageKeys: number[],
  page0Cursor: string | null,
  page0UpdatedAt: number
): string => JSON.stringify({ pageKeys, page0Cursor, page0UpdatedAt });

/**
 * Internal infinite query using TanStack Query + convexQuery.
 */
const createInfiniteQueryInternal = <Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query>,
  options: InfiniteQueryOptions<PaginatedQueryItem<Query>>
): InfiniteQueryResult<PaginatedQueryItem<Query>> => {
  const { limit, enabled, placeholderData } = options;

  const { isLoading: isAuthLoading } = useSafeConvexAuth();
  const meta = useMeta();
  const queryClient = useQueryClient();

  // Look up server-prefetched data
  const prefetchedFirstPage = createMemo(() => {
    const serverQueryKey = [
      'convexQuery',
      getFunctionName(query),
      {
        ...(args as Record<string, unknown>),
        cursor: null,
        limit,
      },
    ];
    return queryClient.getQueryData(serverQueryKey) ?? null;
  });

  const skip = createMemo(
    () => !prefetchedFirstPage() && (isAuthLoading || enabled === false)
  );

  const argsObject = createMemo(
    () => (skip() ? {} : args) as Record<string, unknown>
  );

  const storeKey = createMemo(() =>
    JSON.stringify({ query: getFunctionName(query), args: argsObject() })
  );

  const getPaginationState = (key: string): PaginationState | undefined => {
    const queryKey = [PAGINATION_KEY_PREFIX, key] as const;
    return queryClient.getQueryData<PaginationState>(queryKey);
  };

  const setPaginationState = (key: string, state: PaginationState) => {
    const queryKey = [PAGINATION_KEY_PREFIX, key] as const;
    queryClient.setQueryData<PaginationState>(queryKey, state);
  };

  const createInitialState = (): PaginationState => {
    const currentStoreKey = storeKey();
    const currentSkip = skip();
    const currentArgsObject = argsObject();
    const id = getOrCreatePaginationId(currentStoreKey);
    return {
      id,
      nextPageKey: 1,
      pageKeys: currentSkip ? [] : [0],
      queries: currentSkip
        ? {}
        : {
            0: {
              args: {
                ...currentArgsObject,
                cursor: null,
                limit,
                __paginationId: id,
              },
            },
          },
      version: 0,
    };
  };

  // Initialize state from queryClient or create fresh
  const getInitialState = (): PaginationState => {
    if (skip()) {
      return { id: 0, nextPageKey: 1, pageKeys: [], queries: {}, version: 0 };
    }
    const existing = getPaginationState(storeKey());
    if (existing) return existing;
    const initial = createInitialState();
    return initial;
  };

  const [state, setLocalState] = createSignal<PaginationState>(
    getInitialState()
  );

  const setState = (
    updater: PaginationState | ((prev: PaginationState) => PaginationState)
  ) => {
    setLocalState((prev) => {
      const newState = typeof updater === 'function' ? updater(prev) : updater;
      setPaginationState(storeKey(), newState);
      return newState;
    });
  };

  // Re-initialize when skip or storeKey changes
  let prevStoreKey = storeKey();
  let prevSkip = skip();

  createEffect(() => {
    const currentStoreKey = storeKey();
    const currentSkip = skip();

    const storeKeyChanged = currentStoreKey !== prevStoreKey;
    const skipChanged = currentSkip !== prevSkip;

    prevStoreKey = currentStoreKey;
    prevSkip = currentSkip;

    if (currentSkip) return;

    if (skipChanged && !currentSkip) {
      const existing = getPaginationState(currentStoreKey);
      if (existing) {
        setLocalState(existing);
        return;
      }
      const newState = createInitialState();
      setLocalState(newState);
      setPaginationState(currentStoreKey, newState);
      return;
    }

    if (storeKeyChanged) {
      const existing = getPaginationState(currentStoreKey);
      if (existing) {
        setLocalState(existing);
        return;
      }
      const newState = createInitialState();
      setLocalState(newState);
      setPaginationState(currentStoreKey, newState);
    }
  });

  // Build TanStack queries from state
  const tanstackQueries = createMemo(() => {
    const currentState = state();
    const currentSkip = skip();
    const currentMeta = meta;
    return currentState.pageKeys.map((key, index) => {
      const pageArgs = currentState.queries[key]?.args;
      const convexArgs = pageArgs
        ? (({ __paginationId: _id, ...rest }) => rest)(pageArgs)
        : skipToken;

      return {
        ...convexQuery(query, convexArgs as any, currentMeta),
        enabled: !currentSkip && !!currentState.queries[key],
        structuralSharing: false,
        ...(index === 0 && prefetchedFirstPage()
          ? { initialData: prefetchedFirstPage() }
          : {}),
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
    });
  });

  type CombinedResult = {
    data: PaginatedQueryItem<Query>[];
    dataUpdatedAt: number;
    lastPage: PageResultWithSplit<PaginatedQueryItem<Query>> | undefined;
    pages: PaginatedQueryItem<Query>[][];
    status: PaginationStatus;
    error: Error | null;
    isError: boolean;
    isFetching: boolean;
    isFetchNextPageError: boolean;
    isPlaceholderData: boolean;
    isRefetching: boolean;
    isLoading: boolean;
    _rawResults: QueryObserverResult<any, any>[];
    [key: string]: any;
  };

  // Use createQueries to aggregate all page states
  const combined = (createQueries as any)(() => ({
    queries: tanstackQueries() as any,
    combine: (results: QueryObserverResult<any, any>[]): CombinedResult => {
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

      const isPlaceholderData =
        results[0]?.isPlaceholderData ?? !!placeholderData;
      const isFetching = results.some((r) => r.isFetching);
      const dataUpdatedAt = Math.max(
        ...results.map((r) => r.dataUpdatedAt ?? 0)
      );

      const firstResult = results[0];

      return {
        ...(firstResult ?? {}),
        data: allItems,
        dataUpdatedAt,
        lastPage,
        pages,
        status: paginationStatus,
        error: results.find((r) => r.isError)?.error ?? null,
        isError: results.some((r) => r.isError),
        isFetching,
        isFetchNextPageError:
          results.length > 1 && (results.at(-1)?.isError ?? false),
        isPlaceholderData,
        isRefetching: isFetching && allItems.length > 0 && !isPlaceholderData,
        _rawResults: results,
      };
    },
  }));

  // Auto-recovery from stale cursors after WebSocket reconnection
  createEffect(() => {
    const c = combined;
    if (!c.isFetchNextPageError) return;

    const page0Result = c._rawResults?.[0];
    const page0Data = page0Result?.data as
      | PaginationResult<unknown>
      | undefined;
    const page0UpdatedAt = page0Result?.dataUpdatedAt ?? 0;

    const hasPage0Data = page0Data !== undefined && !page0Result?.isError;
    const hasSubsequentErrors = c._rawResults
      ?.slice(1)
      .some((q: QueryObserverResult<any, any>) => q?.isError && !q?.isFetching);

    if (!hasPage0Data || !hasSubsequentErrors || !page0Data?.continueCursor)
      return;

    const currentState = state();
    const recoveryKey = buildRecoveryKey(
      currentState.pageKeys,
      page0Data.continueCursor,
      page0UpdatedAt
    );

    if (currentState.autoRecoveryAttempted === recoveryKey) return;

    const erroredPageKeys = currentState.pageKeys.filter(
      (_, i) => i > 0 && c._rawResults?.[i]?.isError
    );
    const itemsToRecover = erroredPageKeys.reduce((sum, key) => {
      const pageLimit = currentState.queries[key]?.args?.limit ?? limit ?? 20;
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
            ...argsObject(),
            cursor: page0Data.continueCursor!,
            limit: Math.min(itemsToRecover + (limit ?? 20), 500),
            __paginationId: prev.id,
          },
        },
      },
      version: prev.version + 1,
      autoRecoveryAttempted: recoveryKey,
    }));
  });

  // Clear recovery flag on success
  createEffect(() => {
    const c = combined;
    const currentState = state();
    if (
      (c.status === 'CanLoadMore' || c.status === 'Exhausted') &&
      currentState.autoRecoveryAttempted
    ) {
      setState((prev) => ({
        ...prev,
        autoRecoveryAttempted: undefined,
      }));
    }
  });

  // Handle page splitting
  createEffect(() => {
    const c = combined;
    const currentState = state();

    for (let i = 0; i < (c._rawResults?.length ?? 0); i++) {
      const pageQuery = c._rawResults?.[i];
      if (pageQuery?.data) {
        const page = pageQuery.data as PageResultWithSplit<
          PaginatedQueryItem<Query>
        >;
        const pageKey = currentState.pageKeys[i];
        const pageState = currentState.queries[pageKey];

        if (page.splitCursor && pageState && !pageState.endCursor) {
          setState((prev) => {
            const currentPageState = prev.queries[pageKey];
            if (!currentPageState || currentPageState.endCursor) return prev;

            const newKey = prev.nextPageKey;
            const splitCursor = page.splitCursor!;
            const splitPageArgs = {
              ...argsObject(),
              cursor: splitCursor,
              limit: currentPageState.args.limit,
              __paginationId: prev.id,
            };

            const pageKeyIndex = prev.pageKeys.indexOf(pageKey);
            const newPageKeys = [...prev.pageKeys];
            newPageKeys.splice(pageKeyIndex + 1, 0, newKey);

            return {
              ...prev,
              nextPageKey: newKey + 1,
              pageKeys: newPageKeys,
              queries: {
                ...prev.queries,
                [pageKey]: {
                  ...currentPageState,
                  endCursor: splitCursor,
                },
                [newKey]: {
                  args: splitPageArgs,
                },
              } as Record<number, PageState>,
            };
          });
          return;
        }
      }
    }
  });

  // loadMore: add new page to state
  const loadMore = (pageLimit?: number) => {
    const c = combined;
    if (c.status !== 'CanLoadMore' || !c.lastPage?.continueCursor) {
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
              ...argsObject(),
              cursor: c.lastPage!.continueCursor,
              limit: pageLimit,
              __paginationId: prev.id,
            },
          },
        },
      };
    });
  };

  const { _rawResults: _r, lastPage: _lp, ...result } = combined as any;

  const hasNextPage = combined.status === 'CanLoadMore';
  const isFetchingNextPage = combined.status === 'LoadingMore';

  return {
    ...result,
    failureReason: (combined as any).failureReason as Error | null,
    error: combined.error instanceof Error ? combined.error : null,
    fetchNextPage: (n?: number) => loadMore(n ?? limit),
    hasNextPage,
    isFetchingNextPage,
  };
};

/**
 * Infinite query using cRPC-style options (SolidJS).
 * Accepts options from `crpc.posts.list.infiniteQueryOptions()`.
 *
 * @example
 * ```tsx
 * const crpc = useCRPC();
 * const { data, fetchNextPage } = createInfiniteQuery(
 *   crpc.posts.list.infiniteQueryOptions({ userId }, { limit: 20 })
 * );
 * ```
 */
export function createInfiniteQuery<
  T extends FunctionReference<'query'>,
  TItem = ExtractPaginatedItem<FunctionReturnType<T>>,
>(
  infiniteOptions: ConvexInfiniteQueryOptionsWithRef<T>
): InfiniteQueryResult<TItem> {
  const query = infiniteOptions[FUNC_REF_SYMBOL];
  const onQueryUnauthorized = useAuthValue('onQueryUnauthorized');
  const { isLoading: isAuthLoading, isAuthenticated } = useSafeConvexAuth();

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

  const skipUnauthFinal = skipUnauth ?? false;

  const isUnauthorized =
    authType === 'required' && !isAuthLoading && !isAuthenticated;

  const shouldSkip =
    factoryEnabled === false ||
    (authType === 'required' && isAuthLoading) ||
    (authType === 'required' && !isAuthenticated);

  const authError = createMemo(() => {
    if (isUnauthorized && !skipUnauthFinal) {
      return new CRPCClientError({
        code: 'UNAUTHORIZED',
        functionName: queryName,
      });
    }
    return null;
  });

  // Call callback in effect (not during render) to avoid setState-in-render
  createEffect(() => {
    if (isUnauthorized && !skipUnauthFinal) {
      onQueryUnauthorized?.({ queryName });
    }
  });

  const result = createInfiniteQueryInternal(query as any, args as any, {
    limit,
    ...(queryOptions as any),
    enabled: !shouldSkip,
  });

  const authLoadingApplies = authType === 'optional' || authType === 'required';

  const isClientError = isCRPCClientError(result.error);

  const isSkippedUnauth = isUnauthorized && skipUnauthFinal;

  return {
    ...result,
    data: isSkippedUnauth ? ([] as TItem[]) : (result.data as TItem[]),
    pages: isSkippedUnauth ? ([] as TItem[][]) : (result.pages as TItem[][]),
    ...(authError() && { error: authError(), isError: true }),
    ...(isSkippedUnauth && { isPlaceholderData: false }),
    isLoading:
      (authLoadingApplies && isAuthLoading) ||
      (!isClientError && !authError() && !isSkippedUnauth && result.isLoading),
  } as InfiniteQueryResult<TItem>;
}
