import { makeFunctionReference } from 'convex/server';

import {
  convexAction,
  convexInfiniteQueryOptions,
  convexQuery,
} from './query-options';
import type { Meta } from './types';

const meta: Meta = {
  todos: {
    list: { auth: 'required' },
  },
  ai: {
    generate: { auth: 'optional' },
  },
};

describe('convexQuery', () => {
  test('builds reactive query options with function meta', () => {
    const listTodos = makeFunctionReference<'query'>('todos:list');
    const options = convexQuery(
      listTodos as any,
      { status: 'open' } as any,
      meta,
      { skipUnauth: true }
    );

    expect(options.queryKey).toEqual([
      'convexQuery',
      'todos:list',
      { status: 'open' },
    ]);
    expect(options.staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(options.enabled).toBeUndefined();
    expect(options.meta).toEqual({
      authType: 'required',
      skipUnauth: true,
      subscribe: true,
    });
  });

  test('supports skip mode and disables the query', () => {
    const listTodos = makeFunctionReference<'query'>('todos:list');
    const options = convexQuery(listTodos as any, 'skip', meta);

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual(['convexQuery', 'todos:list', 'skip']);
    expect(options.meta.authType).toBe('required');
    expect(options.meta.subscribe).toBe(true);
  });
});

describe('convexAction', () => {
  test('builds non-reactive action query options', () => {
    const generate = makeFunctionReference<'action'>('ai:generate');
    const options = convexAction(
      generate as any,
      { prompt: 'hello' } as any,
      meta
    );

    expect(options.queryKey).toEqual([
      'convexAction',
      'ai:generate',
      { prompt: 'hello' },
    ]);
    expect(options.enabled).toBeUndefined();
    expect(options.meta).toEqual({
      authType: 'optional',
      skipUnauth: undefined,
      subscribe: false,
    });
  });

  test('supports skip mode and uses empty args payload', () => {
    const generate = makeFunctionReference<'action'>('ai:generate');
    const options = convexAction(generate as any, 'skip', meta, {
      skipUnauth: true,
    });

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual(['convexAction', 'ai:generate', {}]);
    expect(options.meta.skipUnauth).toBe(true);
    expect(options.meta.subscribe).toBe(false);
  });
});

describe('convexInfiniteQueryOptions', () => {
  test('builds paginated query options and passes through extra query options', () => {
    const listTodos = makeFunctionReference<'query'>('todos:list');
    const options = convexInfiniteQueryOptions(
      listTodos as any,
      { status: 'open' },
      {
        limit: 25,
        enabled: false,
        staleTime: 123,
        retry: 0,
        skipUnauth: true,
      } as any,
      meta
    );

    expect(options.queryKey).toEqual([
      'convexQuery',
      'todos:list',
      { status: 'open', cursor: null, limit: 25 },
    ]);
    expect(options.enabled).toBe(false);
    expect(options.staleTime).toBe(123);
    expect((options as any).retry).toBe(0);
    expect(options.meta).toEqual({
      authType: 'required',
      skipUnauth: true,
      subscribe: true,
      queryName: 'todos:list',
      args: { status: 'open' },
      limit: 25,
    });
  });

  test('supports skip mode with disabled query state', () => {
    const listTodos = makeFunctionReference<'query'>('todos:list');
    const options = convexInfiniteQueryOptions(
      listTodos as any,
      'skip',
      {},
      meta
    );

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual([
      'convexQuery',
      'todos:list',
      { cursor: null, limit: undefined },
    ]);
    expect(options.meta?.args).toEqual({});
    expect(options.meta?.queryName).toBe('todos:list');
  });
});
