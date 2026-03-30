import { makeFunctionReference } from 'convex/server';
import { encodeWire } from '../crpc/transformer';

import { createServerCaller } from './caller';

describe('server/caller', () => {
  test('routes calls to fetchQuery/fetchMutation/fetchAction based on meta', async () => {
    const api = {
      posts: {
        list: makeFunctionReference<'query'>('posts:list'),
        create: makeFunctionReference<'mutation'>('posts:create'),
        doThing: makeFunctionReference<'action'>('posts:doThing'),
      },
      nested: {
        queries: {
          list: makeFunctionReference<'query'>('nested/queries:list'),
        },
      },
    } as const;

    const fetchQuery = mock(async (_fn: any, _args: any, _opts?: any) => 'Q');
    const fetchMutation = mock(
      async (_fn: any, _args: any, _opts?: any) => 'M'
    );
    const fetchAction = mock(async (_fn: any, _args: any, _opts?: any) => 'A');

    const meta = {
      posts: {
        list: { type: 'query' },
        create: { type: 'mutation' },
        doThing: { type: 'action' },
      },
      'nested/queries': {
        list: { type: 'query' },
      },
    } as any;

    const caller = createServerCaller(api, {
      fetchQuery: fetchQuery as any,
      fetchMutation: fetchMutation as any,
      fetchAction: fetchAction as any,
      meta,
    });

    await expect(caller.posts.list({ tag: 'x' })).resolves.toBe('Q');
    await expect(caller.posts.create({ title: 'hi' })).resolves.toBe('M');
    await expect(caller.posts.doThing({})).resolves.toBe('A');
    await expect(caller.nested.queries.list()).resolves.toBe('Q');

    expect(fetchQuery.mock.calls.length).toBeGreaterThan(0);
    expect(fetchMutation.mock.calls.length).toBeGreaterThan(0);
    expect(fetchAction.mock.calls.length).toBeGreaterThan(0);

    expect(fetchQuery.mock.calls[0]?.[0]).toBe(api.posts.list);
    expect(fetchMutation.mock.calls[0]?.[0]).toBe(api.posts.create);
    expect(fetchAction.mock.calls[0]?.[0]).toBe(api.posts.doThing);
  });

  test('passes args and caller opts through to fetchers (including skipUnauth)', async () => {
    const api = {
      users: {
        me: makeFunctionReference<'query'>('users:me'),
      },
    } as const;

    const fetchQuery = mock(async (_fn: any, _args: any, _opts?: any) => 'ok');

    const caller = createServerCaller(api, {
      fetchQuery: fetchQuery as any,
      fetchMutation: mock(async () => null) as any,
      fetchAction: mock(async () => null) as any,
      meta: { users: { me: { type: 'query' } } } as any,
    });

    await expect(
      caller.users.me({ include: 'profile' }, { skipUnauth: true })
    ).resolves.toBe('ok');

    expect(fetchQuery).toHaveBeenCalledWith(
      api.users.me,
      { include: 'profile' },
      { skipUnauth: true }
    );
  });

  test('encodes Date args and decodes Date responses', async () => {
    const api = {
      users: {
        me: makeFunctionReference<'query'>('users:me'),
      },
    } as const;

    const encoded = encodeWire({ at: new Date(1_700_000_000_000) });
    const fetchQuery = mock(async (_fn: any, args: any) => {
      expect(args).toEqual(encoded);
      return encoded;
    });

    const caller = createServerCaller(api, {
      fetchQuery: fetchQuery as any,
      fetchMutation: mock(async () => null) as any,
      fetchAction: mock(async () => null) as any,
      meta: { users: { me: { type: 'query' } } } as any,
    });

    const result = await caller.users.me({
      at: new Date(1_700_000_000_000),
    } as any);

    expect((result as any).at).toBeInstanceOf(Date);
    expect((result as any).at.getTime()).toBe(1_700_000_000_000);
  });

  test('supports custom transformer in caller options', async () => {
    const api = {
      users: {
        me: makeFunctionReference<'query'>('users:me'),
      },
    } as const;

    const fetchQuery = mock(async (_fn: any, args: any) => {
      expect(args).toEqual({ $in: { role: 'admin' } });
      return { $out: { ok: true } };
    });

    const caller = createServerCaller(api, {
      fetchQuery: fetchQuery as any,
      fetchMutation: mock(async () => null) as any,
      fetchAction: mock(async () => null) as any,
      meta: { users: { me: { type: 'query' } } } as any,
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

    await expect(caller.users.me({ role: 'admin' } as any)).resolves.toEqual({
      ok: true,
    });
  });
});
