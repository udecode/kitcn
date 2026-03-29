import { makeFunctionReference } from 'convex/server';
import { encodeWire } from '../crpc/transformer';
import { createVanillaCRPCProxy } from './vanilla-client';

const queryFn = makeFunctionReference<'query'>('users:get');
const mutationFn = makeFunctionReference<'mutation'>('users:update');
const actionFn = makeFunctionReference<'action'>('users:sync');

const api = {
  users: {
    get: queryFn,
    sync: actionFn,
    update: mutationFn,
  },
};

const meta = {
  users: {
    get: { type: 'query' },
    sync: { type: 'action' },
    update: { type: 'mutation' },
  },
} as any;

describe('createVanillaCRPCProxy', () => {
  test('routes query calls to convex query/action by function type', async () => {
    const client = {
      action: async (...args: unknown[]) => ({ args, kind: 'action' }),
      mutation: async (...args: unknown[]) => ({ args, kind: 'mutation' }),
      query: async (...args: unknown[]) => ({ args, kind: 'query' }),
      watchQuery: () => ({ unsubscribe: () => {} }),
    } as any;

    const proxy = createVanillaCRPCProxy(api, meta, client);
    const queryResult = await proxy.users.get.query({ id: 'u1' });
    const actionQueryResult = await proxy.users.sync.query({ force: true });

    expect(queryResult).toMatchObject({
      kind: 'query',
    });
    expect((queryResult as any).args[1]).toEqual({ id: 'u1' });

    expect(actionQueryResult).toMatchObject({
      kind: 'action',
    });
    expect((actionQueryResult as any).args[1]).toEqual({ force: true });
  });

  test('routes mutate calls to convex mutation/action by function type', async () => {
    const client = {
      action: async (...args: unknown[]) => ({ args, kind: 'action' }),
      mutation: async (...args: unknown[]) => ({ args, kind: 'mutation' }),
      query: async (...args: unknown[]) => ({ args, kind: 'query' }),
      watchQuery: () => ({ unsubscribe: () => {} }),
    } as any;

    const proxy = createVanillaCRPCProxy(api, meta, client);
    const mutationResult = await proxy.users.update.mutate({ id: 'u1' });
    const actionResult = await proxy.users.sync.mutate({ force: true });

    expect(mutationResult).toMatchObject({
      kind: 'mutation',
    });
    expect((mutationResult as any).args[1]).toEqual({ id: 'u1' });

    expect(actionResult).toMatchObject({
      kind: 'action',
    });
    expect((actionResult as any).args[1]).toEqual({ force: true });
  });

  test('routes watchQuery to convex watchQuery with default args', () => {
    const watch = { unsubscribe: () => {} } as any;
    const watchQuery = spyOn(
      {
        fn: (..._args: unknown[]) => watch,
      },
      'fn'
    );

    const client = {
      action: async () => null,
      mutation: async () => null,
      query: async () => null,
      watchQuery,
    } as any;

    const proxy = createVanillaCRPCProxy(api, meta, client);
    const result = proxy.users.get.watchQuery();

    expect(result).toBe(watch);
    expect(watchQuery).toHaveBeenCalledTimes(1);
    expect(watchQuery.mock.calls[0]?.[1]).toEqual({});
  });

  test('encodes Date args and decodes Date responses', async () => {
    const now = new Date('2024-01-01T00:00:00.000Z');

    const client = {
      action: async (..._args: unknown[]) => null,
      mutation: async (..._args: unknown[]) => null,
      query: async (...args: unknown[]) => {
        expect(args[1]).toEqual(encodeWire({ at: now }));
        return encodeWire({ at: now });
      },
      watchQuery: () => ({ unsubscribe: () => {} }),
    } as any;

    const proxy = createVanillaCRPCProxy(api, meta, client);
    const result = await proxy.users.get.query({ at: now } as any);

    expect((result as any).at).toBeInstanceOf(Date);
    expect((result as any).at.getTime()).toBe(now.getTime());
  });

  test('accepts custom transformer for encode/decode', async () => {
    const client = {
      action: async (..._args: unknown[]) => null,
      mutation: async (..._args: unknown[]) => null,
      query: async (...args: unknown[]) => {
        expect(args[1]).toEqual({ $in: { id: 'u1' } });
        return { $out: { ok: true } };
      },
      watchQuery: () => ({ unsubscribe: () => {} }),
    } as any;

    const proxy = createVanillaCRPCProxy(api, meta, client, {
      input: {
        serialize: (value: unknown) => ({ $in: value }),
        deserialize: (value: unknown) => value,
      },
      output: {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => (value as any)?.$out ?? value,
      },
    });

    await expect(proxy.users.get.query({ id: 'u1' } as any)).resolves.toEqual({
      ok: true,
    });
  });
});
