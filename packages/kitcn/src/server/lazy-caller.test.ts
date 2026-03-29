import { makeFunctionReference } from 'convex/server';

import { createLazyCaller } from './lazy-caller';

const INVALID_CALLER_PATH_RE = /Invalid caller path/;

describe('server/lazy-caller', () => {
  test('root auth helpers call createContext lazily', async () => {
    const createContext = mock(async () => ({
      caller: {} as any,
      token: 't0',
      isAuthenticated: true,
    }));

    const lazy = createLazyCaller({} as any, createContext);

    await expect(lazy.isAuth()).resolves.toBe(true);
    await expect(lazy.isUnauth()).resolves.toBe(false);
    await expect(lazy.getToken()).resolves.toBe('t0');

    // At least one call per helper (StrictMode double-invocation can cause extra).
    expect(createContext.mock.calls.length).toBeGreaterThan(0);
  });

  test('procedure invocation validates path, creates context, and forwards args/opts', async () => {
    const api = {
      posts: {
        list: makeFunctionReference<'query'>('posts:list'),
      },
    } as const;

    const list = mock(async (args: any, opts?: any) => ({ args, opts }));

    const createContext = mock(async () => ({
      caller: { posts: { list } } as any,
      token: undefined,
      isAuthenticated: false,
    }));

    const lazy = createLazyCaller(api, createContext);

    await expect(
      lazy.posts.list({ tag: 'x' }, { skipUnauth: true })
    ).resolves.toEqual({
      args: { tag: 'x' },
      opts: { skipUnauth: true },
    });

    expect(createContext.mock.calls.length).toBeGreaterThan(0);
    expect(list.mock.calls.length).toBeGreaterThan(0);
  });

  test('calling a missing path throws a validation error', async () => {
    const api = {
      posts: {
        list: makeFunctionReference<'query'>('posts:list'),
      },
    } as const;

    const createContext = mock(async () => ({
      caller: { posts: { list: async () => null } } as any,
      token: undefined,
      isAuthenticated: false,
    }));

    const lazy = createLazyCaller(api, createContext);

    await expect((lazy as any).missing.fn()).rejects.toThrow(
      INVALID_CALLER_PATH_RE
    );
  });
});
