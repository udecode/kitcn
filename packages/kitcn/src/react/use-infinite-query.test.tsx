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
    enabled?: boolean;
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

  test('prefetched first page bypasses auth-loading skip and passes initialData to useQueries', () => {
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
    expect((firstCall.queries[0] as any).initialData).toBe(prefetched);
    expect((firstCall.queries[0] as any).enabled).toBe(true);
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
});
