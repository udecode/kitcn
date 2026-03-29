/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { renderHook } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { makeFunctionReference } from 'convex/server';
import type { JSX } from 'solid-js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CRPCClientError } from '../crpc/error';
import { convexInfiniteQueryOptions } from '../crpc/query-options';
import { FUNC_REF_SYMBOL } from '../crpc/types';
import * as authStoreModule from './auth-store';
import { useInfiniteQuery } from './use-infinite-query';

// Mock useQueries at the module level (ESM modules are non-configurable)
const mockUseQueries = vi.fn();

vi.mock('@tanstack/solid-query', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useQueries: (...args: any[]) => mockUseQueries(...args),
  };
});

type UseQueriesArg = {
  queries: any[];
  combine: (results: any[]) => any;
};

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
  isRefetching: false,
  failureReason: null,
  _rawResults: [],
  lastPage: undefined,
  ...overrides,
});

describe('useInfiniteQuery', () => {
  let useSafeConvexAuthSpy: ReturnType<typeof vi.spyOn>;
  let useAuthValueSpy: ReturnType<typeof vi.spyOn>;

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
    return (props: { children: JSX.Element }) => (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    useQueriesCalls.length = 0;

    useSafeConvexAuthSpy = vi
      .spyOn(authStoreModule, 'useSafeConvexAuth')
      .mockImplementation(
        () => ({ isLoading: false, isAuthenticated: true }) as any
      );

    useAuthValueSpy = vi
      .spyOn(authStoreModule, 'useAuthValue')
      .mockImplementation(() => (() => {}) as any);

    mockUseQueries.mockImplementation((accessor: any) => {
      const arg = typeof accessor === 'function' ? accessor() : accessor;
      useQueriesCalls.push(arg);
      return makeCombined() as any;
    });
  });

  afterEach(() => {
    useSafeConvexAuthSpy.mockRestore();
    useAuthValueSpy.mockRestore();
    mockUseQueries.mockReset();
  });

  test('returns UNAUTHORIZED error and calls onQueryUnauthorized when required and unauthenticated', () => {
    const onQueryUnauthorized = vi.fn();
    useSafeConvexAuthSpy.mockImplementation(
      () =>
        ({
          isLoading: false,
          isAuthenticated: false,
        }) as any
    );
    useAuthValueSpy.mockImplementation((key: any) => {
      if (key === 'onQueryUnauthorized') return onQueryUnauthorized as any;
      return (() => {}) as any;
    });

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ limit: 2 });
    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(result.isError).toBe(true);
    expect(result.error).toBeInstanceOf(CRPCClientError);
    expect((result.error as CRPCClientError).code).toBe('UNAUTHORIZED');
    expect((result.error as CRPCClientError).functionName).toBe('posts:list');

    expect(onQueryUnauthorized).toHaveBeenCalledTimes(1);
    expect(onQueryUnauthorized).toHaveBeenCalledWith({
      queryName: 'posts:list',
    });
  });

  test('skipUnauth returns empty data and does not call onQueryUnauthorized when unauthenticated', () => {
    const onQueryUnauthorized = vi.fn();
    useSafeConvexAuthSpy.mockImplementation(
      () =>
        ({
          isLoading: false,
          isAuthenticated: false,
        }) as any
    );
    useAuthValueSpy.mockImplementation((key: any) => {
      if (key === 'onQueryUnauthorized') return onQueryUnauthorized as any;
      return (() => {}) as any;
    });
    mockUseQueries.mockImplementation((accessor: any) => {
      const arg = typeof accessor === 'function' ? accessor() : accessor;
      useQueriesCalls.push(arg);
      return makeCombined({ isPlaceholderData: true }) as any;
    });

    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ limit: 2, skipUnauth: true });
    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(result.isError).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(result.pages).toEqual([]);
    expect(result.isPlaceholderData).toBe(false);
    expect(onQueryUnauthorized).toHaveBeenCalledTimes(0);
  });

  test('prefetched first page bypasses auth-loading skip and passes initialData to useQueries', () => {
    useSafeConvexAuthSpy.mockImplementation(
      () =>
        ({
          isLoading: true,
          isAuthenticated: false,
        }) as any
    );

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

    // Capture the accessor so we can re-evaluate it after state changes
    let capturedAccessor: (() => UseQueriesArg) | null = null;

    mockUseQueries.mockImplementation((accessor: any) => {
      capturedAccessor = accessor;
      const arg = typeof accessor === 'function' ? accessor() : accessor;
      useQueriesCalls.push(arg);
      return makeCombined({
        status: 'CanLoadMore',
        lastPage: { continueCursor: 'CUR' },
      }) as any;
    });

    const options = createOptions({ limit: 2, args: { tag: 'x' } });
    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    expect(useQueriesCalls.at(-1)?.queries).toHaveLength(1);

    result.fetchNextPage(5);

    // In Solid, the mock doesn't re-run on signal changes,
    // so re-evaluate the captured accessor to get updated queries
    const updatedArg = capturedAccessor!();
    expect(updatedArg.queries).toHaveLength(2);
    const queryKey1 = (updatedArg.queries[1] as any).queryKey as unknown[];
    const args1 = queryKey1[2] as Record<string, unknown>;
    expect(args1.tag).toBe('x');
    expect(args1.cursor).toBe('CUR');
    expect(args1.limit).toBe(5);
    expect(Object.hasOwn(args1, '__paginationId')).toBe(false);
  });
});
