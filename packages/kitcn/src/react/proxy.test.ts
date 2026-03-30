import { skipToken } from '@tanstack/react-query';
import { makeFunctionReference } from 'convex/server';
import { createCRPCOptionsProxy } from './proxy';

const api = {
  todos: {
    create: makeFunctionReference<'mutation'>('todos:create'),
    list: makeFunctionReference<'query'>('todos:list'),
  },
  workers: {
    run: makeFunctionReference<'action'>('workers:run'),
  },
};

const meta = {
  todos: {
    create: { auth: 'required', type: 'mutation' },
    list: { auth: 'optional', type: 'query' },
  },
  workers: {
    run: { auth: 'required', type: 'action' },
  },
} as any;

describe('createCRPCOptionsProxy', () => {
  test('builds query keys and filters with proper query prefix', () => {
    const proxy = createCRPCOptionsProxy(api, meta);

    expect(proxy.todos.list.queryKey({ status: 'open' })).toEqual([
      'convexQuery',
      'todos:list',
      { status: 'open' },
    ]);
    expect(proxy.workers.run.queryKey({ id: 'w1' })).toEqual([
      'convexAction',
      'workers:run',
      { id: 'w1' },
    ]);

    expect(
      proxy.todos.list.queryFilter({ status: 'open' }, { stale: true })
    ).toEqual({
      queryKey: ['convexQuery', 'todos:list', { status: 'open' }],
      stale: true,
    });
  });

  test('builds static query options for queries and actions', () => {
    const proxy = createCRPCOptionsProxy(api, meta);
    const queryOpts = proxy.todos.list.staticQueryOptions({ status: 'open' });
    const actionOpts = proxy.workers.run.staticQueryOptions(skipToken);

    expect(queryOpts.queryKey).toEqual([
      'convexQuery',
      'todos:list',
      { status: 'open' },
    ]);
    expect(queryOpts.meta.authType).toBe('optional');
    expect(queryOpts.meta.subscribe).toBe(true);

    expect(actionOpts.queryKey).toEqual(['convexAction', 'workers:run', {}]);
    expect(actionOpts.enabled).toBe(false);
    expect(actionOpts.meta.authType).toBe('required');
    expect(actionOpts.meta.subscribe).toBe(false);
  });

  test('exposes infinite and mutation key helpers and function metadata', () => {
    const proxy = createCRPCOptionsProxy(api, meta);

    expect(proxy.todos.list.infiniteQueryKey({ status: 'open' })).toEqual([
      'convexQuery',
      'todos:list',
      { status: 'open' },
    ]);
    expect(proxy.todos.list.infiniteQueryKey()).toEqual([
      'convexQuery',
      'todos:list',
      {},
    ]);
    expect(proxy.todos.create.mutationKey()).toEqual([
      'convexMutation',
      'todos:create',
    ]);
    expect(proxy.todos.list.meta as any).toEqual({
      auth: 'optional',
      type: 'query',
    } as any);
  });
});
