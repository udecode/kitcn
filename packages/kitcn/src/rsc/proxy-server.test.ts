import { makeFunctionReference } from 'convex/server';
import { createApiLeaf } from '../server/api-entry';

import { createServerCRPCProxy } from './proxy-server';

const HTTP_ROUTE_NOT_FOUND_MISSING_RE = /HTTP route not found: missing/i;

describe('rsc/proxy-server', () => {
  test('queryOptions delegates to convexQuery and attaches correct key/meta', () => {
    const listRef = makeFunctionReference<
      'query',
      { tag: string },
      { items: string[] }
    >('posts:list');

    const apiWithMeta = {
      posts: {
        list: createApiLeaf<'query', typeof listRef>(listRef, {
          type: 'query',
          auth: 'optional',
        }),
      },
    } as const;

    const crpc = createServerCRPCProxy({ api: apiWithMeta });
    const opts = crpc.posts.list.queryOptions(
      { tag: 'x' },
      { skipUnauth: true }
    );

    expect(opts.queryKey).toEqual(['convexQuery', 'posts:list', { tag: 'x' }]);
    expect(opts.meta).toMatchObject({ authType: 'optional', skipUnauth: true });
  });

  test('infiniteQueryKey uses the function name and defaults args to empty object', () => {
    const api = {
      posts: {
        list: makeFunctionReference<'query'>('posts:list'),
      },
    } as const;

    const crpc = createServerCRPCProxy({ api });
    expect(crpc.posts.list.infiniteQueryKey()).toEqual([
      'convexQuery',
      'posts:list',
      {},
    ]);
  });

  test('meta returns function metadata from the provided meta object', () => {
    const listRef = makeFunctionReference<
      'query',
      { tag: string },
      { items: string[] }
    >('posts:list');

    const apiWithMeta = {
      posts: {
        list: createApiLeaf<'query', typeof listRef>(listRef, {
          type: 'query',
          auth: 'required',
          limit: 10,
        }),
      },
    } as const;

    const crpc = createServerCRPCProxy({ api: apiWithMeta });
    const listWithRuntimeMeta = crpc.posts.list as unknown as {
      meta: Record<string, unknown>;
    };
    expect(listWithRuntimeMeta.meta).toEqual({
      type: 'query',
      auth: 'required',
      limit: 10,
    });
  });

  test('http.queryOptions uses meta._http route map and throws on missing routes', () => {
    const api = {
      http: {
        health: makeFunctionReference<'query', Record<string, never>, unknown>(
          'http:health'
        ),
        missing: makeFunctionReference<'query', Record<string, never>, unknown>(
          'http:missing'
        ),
      },
      _http: {
        health: { path: '/api/health', method: 'GET' },
      },
    } as const;

    const crpc = createServerCRPCProxy({ api });

    expect(crpc.http.health.queryOptions({})).toMatchObject({
      queryKey: ['httpQuery', 'health', {}],
      meta: { path: '/api/health', method: 'GET' },
    });

    expect(() => crpc.http.missing.queryOptions({})).toThrow(
      HTTP_ROUTE_NOT_FOUND_MISSING_RE
    );
  });
});
