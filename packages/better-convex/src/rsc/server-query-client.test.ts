import * as convexNextjs from 'convex/nextjs';
import { makeFunctionReference } from 'convex/server';

import * as httpServer from './http-server';
import { getServerQueryClientOptions } from './server-query-client';

const CONVEX_SITE_URL_REQUIRED_RE = /convexSiteUrl required for HTTP queries/i;
const HTTP_ROUTE_METADATA_MISSING_HEALTH_RE =
  /HTTP route metadata missing for: health/i;

describe('rsc/server-query-client', () => {
  let fetchHttpRouteSpy: ReturnType<typeof spyOn> | undefined;
  let fetchQuerySpy: ReturnType<typeof spyOn> | undefined;
  let fetchActionSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    fetchHttpRouteSpy?.mockRestore();
    fetchQuerySpy?.mockRestore();
    fetchActionSpy?.mockRestore();
  });

  test('httpQuery requires convexSiteUrl', async () => {
    const opts = getServerQueryClientOptions({
      getToken: async () => 't0',
      convexSiteUrl: undefined,
    });

    await expect(
      opts.queries.queryFn({
        queryKey: ['httpQuery', 'health', {}],
        meta: { path: '/api/health', method: 'GET' },
      })
    ).rejects.toThrow(CONVEX_SITE_URL_REQUIRED_RE);
  });

  test('httpQuery requires route meta.path', async () => {
    const opts = getServerQueryClientOptions({
      getToken: async () => 't0',
      convexSiteUrl: 'https://example.convex.site',
    });

    await expect(
      opts.queries.queryFn({
        queryKey: ['httpQuery', 'health', {}],
        meta: { method: 'GET' },
      })
    ).rejects.toThrow(HTTP_ROUTE_METADATA_MISSING_HEALTH_RE);
  });

  test('httpQuery calls fetchHttpRoute with token', async () => {
    const getToken = mock(async () => 't0');
    fetchHttpRouteSpy = spyOn(httpServer, 'fetchHttpRoute').mockResolvedValue(
      'ok'
    );

    const opts = getServerQueryClientOptions({
      getToken,
      convexSiteUrl: 'https://example.convex.site',
    });

    await expect(
      opts.queries.queryFn({
        queryKey: ['httpQuery', 'health', { a: 1 }],
        meta: { path: '/api/health', method: 'GET' },
      })
    ).resolves.toBe('ok');

    expect(getToken).toHaveBeenCalled();
    expect(fetchHttpRouteSpy).toHaveBeenCalledWith(
      'https://example.convex.site',
      { path: '/api/health', method: 'GET' },
      { a: 1 },
      't0',
      expect.objectContaining({
        input: expect.objectContaining({
          serialize: expect.any(Function),
          deserialize: expect.any(Function),
        }),
        output: expect.objectContaining({
          serialize: expect.any(Function),
          deserialize: expect.any(Function),
        }),
      })
    );
  });

  test('convexQuery returns null when unauthenticated and auth is required', async () => {
    fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockResolvedValue('ok');

    const opts = getServerQueryClientOptions({
      getToken: async () => undefined,
    });

    const funcRef = makeFunctionReference<'query'>('posts:list');
    await expect(
      opts.queries.queryFn({
        queryKey: ['convexQuery', funcRef, {}],
        meta: { authType: 'required' },
      })
    ).resolves.toBeNull();

    expect(fetchQuerySpy).not.toHaveBeenCalled();
  });

  test('convexQuery returns null for auth-required query when token is invalid', async () => {
    fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockRejectedValue({
      data: { code: 'UNAUTHORIZED' },
    });

    const opts = getServerQueryClientOptions({
      getToken: async () => 'stale-token',
    });

    const funcRef = makeFunctionReference<'query'>('user:getCurrentUser');
    await expect(
      opts.queries.queryFn({
        queryKey: ['convexQuery', funcRef, {}],
        meta: { authType: 'required' },
      })
    ).resolves.toBeNull();

    expect(fetchQuerySpy).toHaveBeenCalledWith(
      funcRef,
      {},
      { token: 'stale-token' }
    );
  });

  test('convexQuery calls fetchQuery with token when provided', async () => {
    fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockResolvedValue('Q');

    const opts = getServerQueryClientOptions({
      getToken: async () => 't0',
    });

    const funcRef = makeFunctionReference<'query'>('posts:list');
    await expect(
      opts.queries.queryFn({
        queryKey: ['convexQuery', funcRef, { tag: 'x' }],
        meta: { authType: 'optional' },
      })
    ).resolves.toBe('Q');

    expect(fetchQuerySpy).toHaveBeenCalledWith(
      funcRef,
      { tag: 'x' },
      { token: 't0' }
    );
  });

  test('convexAction calls fetchAction without a token when allowed', async () => {
    fetchActionSpy = spyOn(convexNextjs, 'fetchAction').mockResolvedValue('A');

    const opts = getServerQueryClientOptions({
      getToken: async () => undefined,
    });

    const funcRef = makeFunctionReference<'action'>('ai:run');
    await expect(
      opts.queries.queryFn({
        queryKey: ['convexAction', funcRef, { prompt: 'hi' }],
        meta: { authType: 'optional' },
      })
    ).resolves.toBe('A');

    expect(fetchActionSpy).toHaveBeenCalledWith(
      funcRef,
      { prompt: 'hi' },
      undefined
    );
  });
});
