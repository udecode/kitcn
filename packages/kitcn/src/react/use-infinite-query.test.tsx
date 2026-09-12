import * as reactQueryModule from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { makeFunctionReference } from 'convex/server';
import type { ReactNode } from 'react';
import { CRPCClientError } from '../crpc/error';
import { convexInfiniteQueryOptions } from '../crpc/query-options';
import { FUNC_REF_SYMBOL } from '../crpc/types';
import * as authStoreModule from './auth-store';
import { useInfiniteQuery } from './use-infinite-query';

type UseQueriesArg = Parameters<typeof reactQueryModule.useQueries>[0];

const makeCombined = (
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  data: [],
  pages: [],
  status: 'Exhausted',
  error: null,
  isError: false,
  isLoading: false,
  isFetching: false,
  isFetchNextPageError: false,
  isPlaceholderData: false,
  failureReason: null,
  _rawResults: [],
  lastPage: undefined,
  ...overrides,
});

describe('useInfiniteQuery', () => {
  let useSafeConvexAuthSpy: ReturnType<typeof spyOn>;
  let useAuthValueSpy: ReturnType<typeof spyOn>;
  let useQueriesSpy: ReturnType<typeof spyOn>;

  const useQueriesCalls: UseQueriesArg[] = [];

  const fn = makeFunctionReference<'query'>('posts:list');
  const meta = { posts: { list: { auth: 'required' } } } as any;

  function createOptions(opts: {
    args?: Record<string, unknown>;
    enabled?: boolean | ((query: any) => boolean);
    limit?: number;
    skipUnauth?: boolean;
  }) {
    const { args = { tag: 'x' }, enabled, limit = 2, skipUnauth } = opts;
    const options = convexInfiniteQueryOptions(
      fn,
      args,
      { enabled, limit, skipUnauth },
      meta
    ) as any;
    options[FUNC_REF_SYMBOL] = fn;
    return options;
  }

  function makeWrapper(queryClient: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    useQueriesCalls.length = 0;

    useSafeConvexAuthSpy = spyOn(
      authStoreModule,
      'useSafeConvexAuth'
    ).mockImplementation(() => ({ isLoading: false, isAuthenticated: true }));

    useAuthValueSpy = spyOn(authStoreModule, 'useAuthValue').mockImplementation(
      () => (() => {}) as any
    );

    useQueriesSpy = spyOn(reactQueryModule, 'useQueries').mockImplementation(
      (arg: UseQueriesArg) => {
        useQueriesCalls.push(arg);
        return makeCombined() as any;
      }
    );
  });

  afterEach(() => {
    useSafeConvexAuthSpy.mockRestore();
    useAuthValueSpy.mockRestore();
    useQueriesSpy.mockRestore();
  });

  test('returns UNAUTHORIZED error and calls onQueryUnauthorized when required and unauthenticated', () => {
    const onQueryUnauthorized = mock(() => {});
    useSafeConvexAuthSpy.mockImplementation(() => ({
      isLoading: false,
      isAuthenticated: false,
    }));
    useAuthValueSpy.mockImplementation((key: any) => {
      if (key === 'onQueryUnauthorized') return onQueryUnauthorized as any;
      return (() => {}) as any;
    });

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ limit: 2 });
    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeInstanceOf(CRPCClientError);
    expect((result.current.error as CRPCClientError).code).toBe('UNAUTHORIZED');
    expect((result.current.error as CRPCClientError).functionName).toBe(
      'posts:list'
    );

    expect(onQueryUnauthorized).toHaveBeenCalledTimes(1);
    expect(onQueryUnauthorized).toHaveBeenCalledWith({
      queryName: 'posts:list',
    });
  });

  test('skipUnauth returns empty data and does not call onQueryUnauthorized when unauthenticated', () => {
    const onQueryUnauthorized = mock(() => {});
    useSafeConvexAuthSpy.mockImplementation(() => ({
      isLoading: false,
      isAuthenticated: false,
    }));
    useAuthValueSpy.mockImplementation((key: any) => {
      if (key === 'onQueryUnauthorized') return onQueryUnauthorized as any;
      return (() => {}) as any;
    });
    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      return makeCombined({ isPlaceholderData: true }) as any;
    });

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ limit: 2, skipUnauth: true });
    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([]);
    expect(result.current.pages).toEqual([]);
    expect(result.current.isPlaceholderData).toBe(false);
    expect(onQueryUnauthorized).toHaveBeenCalledTimes(0);
  });

  test('forwards a function-form enabled predicate to the page queries', () => {
    const predicate = mock(() => false);

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ enabled: predicate, limit: 2 });
    renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(useQueriesCalls.length).toBeGreaterThan(0);
    const pageEnabled = (useQueriesCalls[0].queries[0] as any).enabled;

    // The predicate must survive all the way to useQueries, not be collapsed
    // into a boolean by the enabled === false checks along the way.
    expect(typeof pageEnabled).toBe('function');
    expect(pageEnabled({} as any)).toBe(false);
    expect(predicate).toHaveBeenCalled();
  });

  test('still disables page queries for a boolean enabled: false', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ enabled: false, limit: 2 });
    renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(useQueriesCalls.length).toBeGreaterThan(0);
    // A boolean false skips before any page query is built.
    expect(useQueriesCalls[0].queries).toHaveLength(0);
  });

  test('prefetched first page hydrates while auth loading without fetching', () => {
    useSafeConvexAuthSpy.mockImplementation(() => ({
      isLoading: true,
      isAuthenticated: false,
    }));

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ limit: 2 });
    const prefetched = {
      page: [{ _id: 'u1', name: 'Alice' }],
      isDone: false,
      continueCursor: 'c1',
    };

    queryClient.setQueryData(options.queryKey, prefetched);

    renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(useQueriesCalls.length).toBeGreaterThan(0);
    const firstCall = useQueriesCalls[0];
    expect(firstCall.queries).toHaveLength(1);
    // The page reads the prefetch straight out of the cache — it is keyed
    // exactly like the server wrote it. Forwarding it as `initialData` would
    // additionally freeze it into the query's `initialState`, which an account
    // transition brings back.
    expect((firstCall.queries[0] as any).queryKey).toEqual(options.queryKey);
    expect((firstCall.queries[0] as any).initialData).toBeUndefined();
    expect((firstCall.queries[0] as any).enabled).toBe(false);
  });

  test('prefetched optional first page stays disabled while auth loads', () => {
    useSafeConvexAuthSpy.mockImplementation(() => ({
      isLoading: true,
      isAuthenticated: false,
    }));
    const optionalMeta = {
      posts: { list: { auth: 'optional' } },
    } as any;
    const options = convexInfiniteQueryOptions(
      fn,
      { tag: 'x' },
      { limit: 2 },
      optionalMeta
    ) as any;
    options[FUNC_REF_SYMBOL] = fn;
    const queryClient = new QueryClient();
    queryClient.setQueryData(options.queryKey, {
      page: [{ _id: 'u1' }],
      isDone: false,
      continueCursor: 'c1',
    });

    renderHook(() => useInfiniteQuery(options), {
      wrapper: makeWrapper(queryClient),
    });

    expect((useQueriesCalls.at(-1)!.queries[0] as any).enabled).toBe(false);
  });

  test('enables a prefetched optional first page after auth settles', () => {
    let isLoading = true;
    useSafeConvexAuthSpy.mockImplementation(() => ({
      isLoading,
      isAuthenticated: !isLoading,
    }));
    const optionalMeta = {
      posts: { list: { auth: 'optional' } },
    } as any;
    const options = convexInfiniteQueryOptions(
      fn,
      { tag: 'x' },
      { limit: 2 },
      optionalMeta
    ) as any;
    options[FUNC_REF_SYMBOL] = fn;
    const queryClient = new QueryClient();
    queryClient.setQueryData(options.queryKey, {
      page: [{ _id: 'u1' }],
      isDone: false,
      continueCursor: 'c1',
    });

    const { rerender } = renderHook(() => useInfiniteQuery(options), {
      wrapper: makeWrapper(queryClient),
    });

    expect((useQueriesCalls.at(-1)!.queries[0] as any).enabled).toBe(false);

    act(() => {
      isLoading = false;
      rerender();
    });

    expect((useQueriesCalls.at(-1)!.queries[0] as any).enabled).toBe(true);
  });

  test('rebuilds an auth-bound list from its first page after an account transition', () => {
    let authEpoch = 0;
    useAuthValueSpy.mockImplementation((key: any) => {
      if (key === 'authEpoch') return authEpoch as any;
      return (() => {}) as any;
    });
    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      return makeCombined({
        status: 'CanLoadMore',
        lastPage: { page: [], isDone: false, continueCursor: 'cursor-a' },
      }) as any;
    });

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const options = createOptions({ limit: 2 });

    const { result, rerender } = renderHook(() => useInfiniteQuery(options), {
      wrapper,
    });

    expect((useQueriesCalls.at(-1) as any).queries).toHaveLength(1);

    act(() => {
      result.current.fetchNextPage();
    });
    const loaded = (useQueriesCalls.at(-1) as any).queries;
    expect(loaded).toHaveLength(2);
    expect(loaded[1].queryKey[2].cursor).toBe('cursor-a');

    authEpoch = 1;
    act(() => {
      rerender();
    });

    // 'cursor-a' indexes into the previous account's result set. Restoring the
    // chain would page from a cursor that no longer describes this list.
    const rebuilt = (useQueriesCalls.at(-1) as any).queries;
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].queryKey[2].cursor).toBeNull();
  });

  test('keeps a list with no auth binding paged across an account transition', () => {
    let authEpoch = 0;
    useAuthValueSpy.mockImplementation((key: any) => {
      if (key === 'authEpoch') return authEpoch as any;
      return (() => {}) as any;
    });
    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      return makeCombined({
        status: 'CanLoadMore',
        lastPage: { page: [], isDone: false, continueCursor: 'cursor-a' },
      }) as any;
    });

    const publicFn = makeFunctionReference<'query'>('posts:feed');
    const publicOptions = convexInfiniteQueryOptions(
      publicFn,
      { tag: 'x' },
      { limit: 2 },
      { posts: { feed: {} } } as any
    ) as any;
    publicOptions[FUNC_REF_SYMBOL] = publicFn;

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const { result, rerender } = renderHook(
      () => useInfiniteQuery(publicOptions),
      { wrapper }
    );

    act(() => {
      result.current.fetchNextPage();
    });
    expect((useQueriesCalls.at(-1) as any).queries).toHaveLength(2);

    authEpoch = 1;
    act(() => {
      rerender();
    });

    // Nothing about a public list is scoped to an account, so signing in must
    // not throw away how far the reader scrolled.
    expect((useQueriesCalls.at(-1) as any).queries).toHaveLength(2);
  });

  test('does not split a native Convex page solely because it has a split cursor', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const firstPage = {
      page: [{ _id: 'post-1' }, { _id: 'post-2' }, { _id: 'post-3' }],
      isDone: false,
      continueCursor: 'cursor-3',
      splitCursor: 'cursor-2',
    };
    const secondPage = {
      page: [{ _id: 'post-4' }, { _id: 'post-5' }, { _id: 'post-6' }],
      isDone: true,
      continueCursor: 'cursor-6',
    };

    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      return (arg as any).combine(
        [firstPage, secondPage]
          .slice(0, arg.queries.length)
          .map((data, index) => ({
            data,
            dataUpdatedAt: index + 1,
            isError: false,
            isFetching: false,
            isLoading: false,
            isPlaceholderData: false,
          }))
      );
    });

    const options = createOptions({ limit: 3 });
    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(result.current.data).toEqual(firstPage.page);
    expect(result.current.hasNextPage).toBe(true);
    expect(useQueriesCalls.at(-1)?.queries).toHaveLength(1);

    act(() => {
      result.current.fetchNextPage();
    });

    expect(result.current.data).toEqual([
      ...firstPage.page,
      ...secondPage.page,
    ]);
    expect(result.current.hasNextPage).toBe(false);
    expect(useQueriesCalls.at(-1)?.queries).toHaveLength(2);
  });

  test('splits a page when Convex recommends it', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const firstPage = {
      page: [{ _id: 'post-1' }, { _id: 'post-2' }, { _id: 'post-3' }],
      isDone: false,
      continueCursor: 'cursor-3',
      splitCursor: 'cursor-2',
      pageStatus: 'SplitRecommended',
    };

    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      return (arg as any).combine([
        {
          data: firstPage,
          dataUpdatedAt: 1,
          isError: false,
          isFetching: false,
          isLoading: false,
          isPlaceholderData: false,
        },
      ]);
    });

    const options = createOptions({ limit: 3 });
    renderHook(() => useInfiniteQuery(options), { wrapper });

    const splitQueries = useQueriesCalls.at(-1)?.queries as any[];
    expect(splitQueries).toHaveLength(2);
    expect(splitQueries[0].queryKey[2]).toMatchObject({
      cursor: null,
      endCursor: 'cursor-2',
    });
    expect(splitQueries[1].queryKey[2]).toMatchObject({
      cursor: 'cursor-2',
      endCursor: 'cursor-3',
    });
  });

  test('resets cleanly when a loaded page cursor becomes invalid', () => {
    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      const pages = [
        {
          page: [{ _id: 'post-1' }],
          isDone: false,
          continueCursor: 'cursor-1',
        },
        {
          page: [{ _id: 'post-2' }],
          isDone: false,
          continueCursor: 'cursor-2',
        },
        {
          page: [{ _id: 'post-3' }],
          isDone: true,
          continueCursor: 'cursor-3',
        },
      ];
      const results = pages.slice(0, arg.queries.length).map((data, index) => ({
        data,
        dataUpdatedAt: index + 1,
        isError: false,
        isFetching: false,
        isLoading: false,
        isPlaceholderData: false,
      }));
      if (arg.queries.length === 3) {
        results[1] = {
          data: undefined as any,
          dataUpdatedAt: 4,
          error: new Error('InvalidCursor'),
          isError: true,
          isFetching: false,
          isLoading: false,
          isPlaceholderData: false,
        } as any;
      }
      return (arg as any).combine(results);
    });

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    act(() => {
      result.current.fetchNextPage();
    });
    act(() => {
      result.current.fetchNextPage();
    });

    const resetQueries = useQueriesCalls.at(-1)?.queries as any[];
    expect(resetQueries).toHaveLength(1);
    expect(resetQueries[0].queryKey[2].cursor).toBeNull();
    expect(result.current.data).toEqual([{ _id: 'post-1' }]);
  });

  test('fetchNextPage adds a new page query with continueCursor and limit', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      return makeCombined({
        status: 'CanLoadMore',
        lastPage: { continueCursor: 'CUR' },
      }) as any;
    });

    const options = createOptions({ limit: 2, args: { tag: 'x' } });
    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(useQueriesCalls.at(-1)?.queries).toHaveLength(1);

    act(() => {
      result.current.fetchNextPage(5);
    });

    expect(useQueriesCalls.at(-1)?.queries).toHaveLength(2);
    const queryKey1 = (useQueriesCalls.at(-1)!.queries[1] as any)
      .queryKey as unknown[];
    const args1 = queryKey1[2] as Record<string, unknown>;
    expect(args1.tag).toBe('x');
    expect(args1.cursor).toBe('CUR');
    expect(args1.limit).toBe(5);
    expect(Object.hasOwn(args1, '__paginationId')).toBe(false);
  });

  test('fetchNextPage keeps a stable identity across renders and live updates', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    useQueriesSpy.mockImplementation((arg: UseQueriesArg) => {
      useQueriesCalls.push(arg);
      // Page queries set structuralSharing: false, so every Convex push hands
      // back a fresh lastPage reference and rebuilds the loadMore callback.
      return makeCombined({
        status: 'CanLoadMore',
        lastPage: { continueCursor: 'CUR' },
      }) as any;
    });

    const options = createOptions({ limit: 2 });
    const { result, rerender } = renderHook(() => useInfiniteQuery(options), {
      wrapper,
    });

    const first = result.current.fetchNextPage;

    rerender();
    expect(result.current.fetchNextPage).toBe(first);

    rerender();
    expect(result.current.fetchNextPage).toBe(first);

    // Still wired to the latest loadMore, not a frozen first-render closure.
    act(() => {
      result.current.fetchNextPage(5);
    });
    expect(useQueriesCalls.at(-1)?.queries).toHaveLength(2);
  });

  test('reuses the page queries array and combine across identical renders', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ limit: 2 });
    const { rerender } = renderHook(
      ({ opts }: { opts: any }) => useInfiniteQuery(opts),
      { initialProps: { opts: options }, wrapper }
    );

    const firstCall = useQueriesCalls.at(-1)!;
    rerender({ opts: options });
    const secondCall = useQueriesCalls.at(-1)!;

    // A missed memo here re-hashes one Convex arg object per loaded page and
    // re-runs the O(loaded items) dedupe on every render.
    expect(secondCall.queries).toBe(firstCall.queries);
    expect((secondCall as any).combine).toBe((firstCall as any).combine);

    // Changed args must still rebuild the page queries.
    rerender({ opts: createOptions({ args: { tag: 'y' }, limit: 2 }) });
    expect(useQueriesCalls.at(-1)!.queries).not.toBe(firstCall.queries);
  });
});
