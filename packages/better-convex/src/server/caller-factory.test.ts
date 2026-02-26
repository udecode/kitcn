import * as convexNextjs from 'convex/nextjs';
import { makeFunctionReference } from 'convex/server';
import { encodeWire } from '../crpc/transformer';

import { createCallerFactory } from './caller-factory';

const CONVEX_SITE_URL_NOT_SET_RE = /CONVEX_SITE_URL is not set/i;
const CONVEX_SITE_URL_INVALID_DOMAIN_RE = /should end in \.convex\.site/i;

const withQueryLeafMeta = (api: {
  posts: { list: ReturnType<typeof makeFunctionReference<'query'>> };
}) =>
  ({
    posts: {
      list: Object.assign(api.posts.list, {
        type: 'query',
        functionRef: api.posts.list,
      }),
    },
  }) as const;

describe('server/caller-factory', () => {
  afterEach(() => {
    // Ensure spies are restored even if a test fails.
    (convexNextjs.fetchQuery as any).mockRestore?.();
    (convexNextjs.fetchMutation as any).mockRestore?.();
    (convexNextjs.fetchAction as any).mockRestore?.();
  });

  test('validates convexSiteUrl', () => {
    expect(() =>
      createCallerFactory({
        api: {},
        convexSiteUrl: '',
      })
    ).toThrow(CONVEX_SITE_URL_NOT_SET_RE);

    expect(() =>
      createCallerFactory({
        api: {},
        convexSiteUrl: 'https://example.convex.cloud',
      })
    ).toThrow(CONVEX_SITE_URL_INVALID_DOMAIN_RE);
  });

  test('skipUnauth returns null when no token and does not call fetchQuery', async () => {
    const fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockImplementation(
      async () => {
        throw new Error('unexpected fetchQuery');
      }
    );

    const api = {
      posts: { list: makeFunctionReference<'query'>('posts:list') },
    };
    const apiWithMeta = withQueryLeafMeta(api);

    const getToken = mock(async () => ({ token: undefined }));

    const { createContext } = createCallerFactory({
      api: apiWithMeta,
      convexSiteUrl: 'https://example.convex.site',
      auth: { getToken },
    });

    const ctx = await createContext({ headers: new Headers() });
    await expect(
      ctx.caller.posts.list({}, { skipUnauth: true })
    ).resolves.toBeNull();
    expect(fetchQuerySpy.mock.calls.length).toBe(0);
  });

  test('returns null for unauthorized errors (no retry)', async () => {
    const fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockImplementation(
      async () => {
        throw Object.assign(new Error('unauthorized'), {
          code: 'UNAUTHORIZED',
        });
      }
    );

    const api = {
      posts: { list: makeFunctionReference<'query'>('posts:list') },
    };
    const apiWithMeta = withQueryLeafMeta(api);

    const getToken = mock(async () => ({ token: 't0', isFresh: true }));

    const { createContext } = createCallerFactory({
      api: apiWithMeta,
      convexSiteUrl: 'https://example.convex.site',
      auth: {
        getToken,
        isUnauthorized: (e) =>
          !!e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as any).code === 'UNAUTHORIZED',
      },
    });

    const ctx = await createContext({ headers: new Headers() });
    await expect(ctx.caller.posts.list({})).resolves.toBeNull();
    expect(fetchQuerySpy.mock.calls.length).toBeGreaterThan(0);
    expect(getToken.mock.calls.length).toBe(1);
  });

  test('refreshes token and retries once on non-unauthorized errors when token is not fresh', async () => {
    const fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockImplementation(
      async (_fn: any, _args: any, opts: any) => {
        if (opts?.token === 't0') {
          throw new Error('boom');
        }
        return 'ok';
      }
    );

    const api = {
      posts: { list: makeFunctionReference<'query'>('posts:list') },
    };
    const apiWithMeta = withQueryLeafMeta(api);

    const getToken = mock(
      async (_siteUrl: string, _headers: Headers, opts?: any) => {
        if (opts?.forceRefresh) return { token: 't1', isFresh: true };
        return { token: 't0', isFresh: false };
      }
    );

    const { createContext } = createCallerFactory({
      api: apiWithMeta,
      convexSiteUrl: 'https://example.convex.site',
      auth: { getToken, isUnauthorized: () => false },
    });

    const ctx = await createContext({ headers: new Headers() });
    await expect(ctx.caller.posts.list({ tag: 'x' })).resolves.toBe('ok');

    expect(fetchQuerySpy.mock.calls.length).toBe(2);
    expect(getToken.mock.calls.length).toBe(2);
    expect(getToken.mock.calls[1]?.[2]?.forceRefresh).toBe(true);
  });

  test('refreshes token and retries once on unauthorized errors when token is not fresh', async () => {
    const fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockImplementation(
      async (_fn: any, _args: any, opts: any) => {
        if (opts?.token === 't0') {
          throw Object.assign(new Error('unauthorized'), {
            code: 'UNAUTHORIZED',
          });
        }
        return 'ok';
      }
    );

    const api = {
      posts: { list: makeFunctionReference<'query'>('posts:list') },
    };
    const apiWithMeta = withQueryLeafMeta(api);

    const getToken = mock(
      async (_siteUrl: string, _headers: Headers, opts?: any) => {
        if (opts?.forceRefresh) return { token: 't1', isFresh: true };
        return { token: 't0', isFresh: false };
      }
    );

    const { createContext } = createCallerFactory({
      api: apiWithMeta,
      convexSiteUrl: 'https://example.convex.site',
      auth: {
        getToken,
        isUnauthorized: (e) =>
          !!e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as any).code === 'UNAUTHORIZED',
      },
    });

    const ctx = await createContext({ headers: new Headers() });
    await expect(ctx.caller.posts.list({ tag: 'x' } as any)).resolves.toBe(
      'ok'
    );
    expect(fetchQuerySpy.mock.calls.length).toBe(2);
    expect(getToken.mock.calls.length).toBe(2);
    expect(getToken.mock.calls[1]?.[2]?.forceRefresh).toBe(true);
  });

  test('encodes Date args before fetch and decodes Date responses', async () => {
    const encoded = encodeWire({ at: new Date(1_700_000_000_000) });
    const fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockImplementation(
      async (_fn: any, args: any) => {
        expect(args).toEqual(encoded);
        return encoded as any;
      }
    );

    const api = {
      posts: { list: makeFunctionReference<'query'>('posts:list') },
    };
    const apiWithMeta = withQueryLeafMeta(api);

    const getToken = mock(async () => ({ token: 't0', isFresh: true }));

    const { createContext } = createCallerFactory({
      api: apiWithMeta,
      convexSiteUrl: 'https://example.convex.site',
      auth: { getToken, isUnauthorized: () => false },
    });

    const ctx = await createContext({ headers: new Headers() });
    const result = await ctx.caller.posts.list({
      at: new Date(1_700_000_000_000),
    } as any);

    expect((result as any).at).toBeInstanceOf(Date);
    expect(fetchQuerySpy).toHaveBeenCalled();
  });

  test('passes custom transformer through caller factory', async () => {
    const fetchQuerySpy = spyOn(convexNextjs, 'fetchQuery').mockImplementation(
      async (_fn: any, args: any) => {
        expect(args).toEqual({ $in: { scope: 'all' } });
        return { $out: 7 } as any;
      }
    );

    const api = {
      posts: { list: makeFunctionReference<'query'>('posts:list') },
    };
    const apiWithMeta = withQueryLeafMeta(api);

    const getToken = mock(async () => ({ token: 't0', isFresh: true }));

    const { createContext } = createCallerFactory({
      api: apiWithMeta,
      convexSiteUrl: 'https://example.convex.site',
      auth: { getToken, isUnauthorized: () => false },
      transformer: {
        input: {
          serialize: (value: unknown) => ({ $in: value }),
          deserialize: (value: unknown) => value,
        },
        output: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) => (value as any)?.$out ?? value,
        },
      },
    });

    const ctx = await createContext({ headers: new Headers() });
    await expect(ctx.caller.posts.list({ scope: 'all' } as any)).resolves.toBe(
      7
    );
    expect(fetchQuerySpy).toHaveBeenCalled();
  });
});
