/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { renderHook } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { makeFunctionReference } from 'convex/server';
import type { JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CRPCClientError } from '../crpc/error';
import { convexInfiniteQueryOptions } from '../crpc/query-options';
import { FUNC_REF_SYMBOL } from '../crpc/types';
import * as authStoreModule from './auth-store';
import { useInfiniteQuery } from './use-infinite-query';

// NOTE: `@tanstack/solid-query` is deliberately NOT mocked. Mocking `useQueries`
// away is what let `state.map is not a function` ship: every mount of this hook
// threw during setup while the suite stayed green. These tests drive the real
// QueryClient, the real observers and the real page fetches.

type FakePage = {
  page: Record<string, unknown>[];
  isDone: boolean;
  continueCursor: string | null;
  splitCursor?: string;
  pageStatus?: 'SplitRecommended' | 'SplitRequired';
};

type PageArgs = Record<string, unknown> & { cursor: string | null };

describe('useInfiniteQuery', () => {
  let useSafeConvexAuthSpy: ReturnType<typeof vi.spyOn>;
  let useAuthValueSpy: ReturnType<typeof vi.spyOn>;

  const fn = makeFunctionReference<'query'>('posts:list');
  const meta = { posts: { list: { auth: 'required' } } } as any;

  /** QueryClient whose default queryFn resolves Convex pagination results. */
  function makeQueryClient(fetchPage: (args: PageArgs) => FakePage) {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: (({ queryKey }: any) =>
            Promise.resolve(fetchPage(queryKey[2] as PageArgs))) as any,
        },
      },
    });
  }

  /** Every Convex page query currently in the cache, in creation order. */
  function convexPageArgs(queryClient: QueryClient): PageArgs[] {
    return queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => (query.queryKey as unknown[])[0] === 'convexQuery')
      .map((query) => (query.queryKey as unknown[])[2] as PageArgs);
  }

  function createOptions(opts: {
    args?: Record<string, unknown>;
    enabled?: boolean | ((query: unknown) => boolean);
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
    useSafeConvexAuthSpy = vi
      .spyOn(authStoreModule, 'useSafeConvexAuth')
      .mockImplementation(
        () => ({ isLoading: false, isAuthenticated: true }) as any
      );

    useAuthValueSpy = vi
      .spyOn(authStoreModule, 'useAuthValue')
      .mockImplementation(() => (() => {}) as any);
  });

  afterEach(() => {
    useSafeConvexAuthSpy.mockRestore();
    useAuthValueSpy.mockRestore();
  });

  test('mounts against unmocked solid-query and resolves the first page', async () => {
    const queryClient = makeQueryClient(() => ({
      page: [{ _id: 'post-1' }, { _id: 'post-2' }],
      isDone: false,
      continueCursor: 'cursor-2',
    }));
    const wrapper = makeWrapper(queryClient);

    // Regression gate: this used to throw `state.map is not a function` inside
    // renderHook, before a single assertion could run.
    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    expect(result.status).toBe('LoadingFirstPage');
    expect(result.isLoading).toBe(true);
    expect(result.data).toHaveLength(0);

    await vi.waitFor(() => expect(result.status).toBe('CanLoadMore'));

    expect(result.data.map((item: any) => item._id)).toEqual([
      'post-1',
      'post-2',
    ]);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].map((item: any) => item._id)).toEqual([
      'post-1',
      'post-2',
    ]);
    expect(result.hasNextPage).toBe(true);
    expect(result.isLoading).toBe(false);
    expect(result.isFetching).toBe(false);
    expect(result.isError).toBe(false);
    expect(result.error).toBeNull();
    expect(convexPageArgs(queryClient)).toHaveLength(1);
  });

  test('marks the list exhausted when the first page is done', async () => {
    const queryClient = makeQueryClient(() => ({
      page: [{ _id: 'post-1' }],
      isDone: true,
      continueCursor: 'cursor-end',
    }));
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    await vi.waitFor(() => expect(result.status).toBe('Exhausted'));
    expect(result.hasNextPage).toBe(false);
    expect(result.data).toHaveLength(1);
  });

  test('surfaces page errors instead of crashing', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: (() => Promise.reject(new Error('boom'))) as any,
        },
      },
    });
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    await vi.waitFor(() => expect(result.isError).toBe(true));
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('boom');
    expect(result.data).toHaveLength(0);
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

    const queryClient = makeQueryClient(() => ({
      page: [],
      isDone: true,
      continueCursor: null,
    }));
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    expect(result.isError).toBe(true);
    expect(result.error).toBeInstanceOf(CRPCClientError);
    expect((result.error as CRPCClientError).code).toBe('UNAUTHORIZED');
    expect((result.error as CRPCClientError).functionName).toBe('posts:list');

    expect(onQueryUnauthorized).toHaveBeenCalledTimes(1);
    expect(onQueryUnauthorized).toHaveBeenCalledWith({
      queryName: 'posts:list',
    });

    // Nothing was fetched: no page query reached the cache.
    expect(convexPageArgs(queryClient)).toHaveLength(0);
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

    const queryClient = makeQueryClient(() => ({
      page: [],
      isDone: true,
      continueCursor: null,
    }));
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2, skipUnauth: true })),
      { wrapper }
    );

    expect(result.isError).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(result.pages).toEqual([]);
    expect(result.isPlaceholderData).toBe(false);
    expect(onQueryUnauthorized).toHaveBeenCalledTimes(0);
  });

  test('keeps a function-form enabled predicate on the real page observer', () => {
    const predicate = vi.fn(() => false);
    const fetchPage = vi.fn(() => ({
      page: [],
      isDone: true,
      continueCursor: null,
    }));
    const queryClient = makeQueryClient(fetchPage);
    const wrapper = makeWrapper(queryClient);

    renderHook(
      () => useInfiniteQuery(createOptions({ enabled: predicate, limit: 2 })),
      { wrapper }
    );

    const [pageQuery] = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => (query.queryKey as unknown[])[0] === 'convexQuery');

    expect(typeof pageQuery?.options.enabled).toBe('function');
    expect(fetchPage).not.toHaveBeenCalled();
    expect(predicate).toHaveBeenCalled();
  });

  test('starts querying when required auth settles after mount', async () => {
    const [auth, setAuth] = createStore({
      isLoading: true,
      isAuthenticated: false,
    });
    useSafeConvexAuthSpy.mockImplementation(() => auth as any);

    const fetchPage = vi.fn(() => ({
      page: [{ _id: 'post-1' }],
      isDone: true,
      continueCursor: null,
    }));
    const queryClient = makeQueryClient(fetchPage);
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    expect(fetchPage).not.toHaveBeenCalled();

    setAuth({ isLoading: false, isAuthenticated: true });

    await vi.waitFor(() => expect(result.status).toBe('Exhausted'));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result.data.map((item: any) => item._id)).toEqual(['post-1']);
  });

  test('restarts an auth-bound cursor chain after an account transition', async () => {
    const [authState, setAuthState] = createStore({ authEpoch: 0 });
    useAuthValueSpy.mockImplementation((key: any) => {
      if (key === 'authEpoch') return authState.authEpoch as any;
      return (() => {}) as any;
    });
    const queryClient = makeQueryClient((args) =>
      args.cursor === null
        ? {
            page: [{ _id: 'post-1' }],
            isDone: false,
            continueCursor: 'cursor-a',
          }
        : {
            page: [{ _id: 'post-2' }],
            isDone: true,
            continueCursor: null,
          }
    );
    const wrapper = makeWrapper(queryClient);
    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 1 })),
      { wrapper }
    );

    await vi.waitFor(() => expect(result.status).toBe('CanLoadMore'));
    result.fetchNextPage();
    await vi.waitFor(() => expect(result.status).toBe('Exhausted'));

    const activePageArgs = () =>
      queryClient
        .getQueryCache()
        .getAll()
        .filter(
          (query) =>
            (query.queryKey as unknown[])[0] === 'convexQuery' &&
            query.getObserversCount() > 0
        )
        .map((query) => (query.queryKey as unknown[])[2] as PageArgs);

    expect(activePageArgs()).toHaveLength(2);

    setAuthState('authEpoch', 1);

    await vi.waitFor(() =>
      expect(activePageArgs()).toEqual([
        expect.objectContaining({ cursor: null }),
      ])
    );
  });

  test('prefetched optional first page hydrates without fetching while auth loads', () => {
    useSafeConvexAuthSpy.mockImplementation(
      () =>
        ({
          isLoading: true,
          isAuthenticated: false,
        }) as any
    );

    const queryClient = makeQueryClient(() => {
      throw new Error('prefetched page must not refetch');
    });
    const wrapper = makeWrapper(queryClient);

    const options = createOptions({ limit: 2 });
    options.meta.authType = 'optional';
    queryClient.setQueryData(options.queryKey, {
      page: [{ _id: 'u1', name: 'Alice' }],
      isDone: false,
      continueCursor: 'c1',
    });

    const { result } = renderHook(() => useInfiniteQuery(options), { wrapper });

    // Hydrated synchronously from the prefetched cache entry.
    expect(result.data.map((item: any) => item._id)).toEqual(['u1']);
    expect(result.status).toBe('CanLoadMore');
    expect(convexPageArgs(queryClient)).toHaveLength(1);
  });

  test('does not split a native Convex page solely because it has a split cursor', async () => {
    const queryClient = makeQueryClient(() => ({
      page: [{ _id: 'post-1' }, { _id: 'post-2' }, { _id: 'post-3' }],
      isDone: false,
      continueCursor: 'cursor-3',
      splitCursor: 'cursor-2',
    }));
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 3 })),
      { wrapper }
    );

    await vi.waitFor(() => expect(result.status).toBe('CanLoadMore'));

    expect(result.data).toHaveLength(3);
    expect(result.hasNextPage).toBe(true);
    expect(convexPageArgs(queryClient)).toHaveLength(1);
  });

  test('splits a page Convex marks as SplitRequired', async () => {
    const queryClient = makeQueryClient((args) =>
      args.cursor === null
        ? {
            page: [{ _id: 'post-1' }, { _id: 'post-2' }],
            isDone: false,
            continueCursor: 'cursor-2',
            splitCursor: 'cursor-1',
            pageStatus: 'SplitRequired',
          }
        : {
            page: [{ _id: 'post-2' }],
            isDone: true,
            continueCursor: 'cursor-2',
          }
    );
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    await vi.waitFor(() => expect(convexPageArgs(queryClient)).toHaveLength(3));

    const [, firstHalfArgs, secondHalfArgs] = convexPageArgs(queryClient);
    expect(firstHalfArgs).toMatchObject({
      cursor: null,
      endCursor: 'cursor-1',
    });
    expect(secondHalfArgs).toMatchObject({
      cursor: 'cursor-1',
      endCursor: 'cursor-2',
    });
    expect(Object.hasOwn(secondHalfArgs, '__paginationId')).toBe(false);

    // Deduplicated across the split boundary.
    await vi.waitFor(() => expect(result.status).toBe('Exhausted'));
    expect(result.data.map((item: any) => item._id)).toEqual([
      'post-1',
      'post-2',
    ]);
  });

  test('resets cleanly when a loaded page cursor becomes invalid', async () => {
    let cursorIsStale = false;
    const queryClient = makeQueryClient((args) => {
      if (args.cursor === null) {
        return {
          page: [{ _id: 'post-1' }],
          isDone: false,
          continueCursor: 'cursor-1',
        };
      }
      if (args.cursor === 'cursor-1') {
        if (cursorIsStale) throw new Error('InvalidCursor');
        return {
          page: [{ _id: 'post-2' }],
          isDone: false,
          continueCursor: 'cursor-2',
        };
      }
      return {
        page: [{ _id: 'post-3' }],
        isDone: true,
        continueCursor: 'cursor-3',
      };
    });
    const wrapper = makeWrapper(queryClient);
    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2 })),
      { wrapper }
    );

    await vi.waitFor(() => expect(result.status).toBe('CanLoadMore'));
    result.fetchNextPage();
    await vi.waitFor(() => expect(result.status).toBe('CanLoadMore'));
    result.fetchNextPage();
    await vi.waitFor(() => expect(result.status).toBe('Exhausted'));
    expect(result.data.map((item: any) => item._id)).toEqual([
      'post-1',
      'post-2',
      'post-3',
    ]);

    cursorIsStale = true;
    await queryClient.refetchQueries();

    await vi.waitFor(() => expect(result.isError).toBe(false));
    expect(result.data.map((item: any) => item._id)).toEqual(['post-1']);
    expect(result.status).toBe('CanLoadMore');
  });

  test('fetchNextPage adds a page query with continueCursor and limit', async () => {
    const queryClient = makeQueryClient((args) =>
      args.cursor === null
        ? {
            page: [{ _id: 'post-1' }],
            isDone: false,
            continueCursor: 'CUR',
          }
        : {
            page: [{ _id: 'post-2' }],
            isDone: true,
            continueCursor: 'CUR2',
          }
    );
    const wrapper = makeWrapper(queryClient);

    const { result } = renderHook(
      () => useInfiniteQuery(createOptions({ limit: 2, args: { tag: 'x' } })),
      { wrapper }
    );

    await vi.waitFor(() => expect(result.status).toBe('CanLoadMore'));
    expect(convexPageArgs(queryClient)).toHaveLength(1);

    result.fetchNextPage(5);

    const pageArgs = convexPageArgs(queryClient);
    expect(pageArgs).toHaveLength(2);
    expect(pageArgs[1].tag).toBe('x');
    expect(pageArgs[1].cursor).toBe('CUR');
    expect(pageArgs[1].limit).toBe(5);
    expect(Object.hasOwn(pageArgs[1], '__paginationId')).toBe(false);

    await vi.waitFor(() => expect(result.status).toBe('Exhausted'));
    expect(result.data.map((item: any) => item._id)).toEqual([
      'post-1',
      'post-2',
    ]);
    expect(result.hasNextPage).toBe(false);
  });
});
