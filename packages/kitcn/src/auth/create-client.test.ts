import { createClient } from './create-client';

const authFunctions = {
  create: 'create',
  deleteMany: 'deleteMany',
  deleteOne: 'deleteOne',
  findMany: 'findMany',
  findOne: 'findOne',
  updateMany: 'updateMany',
  updateOne: 'updateOne',
} as any;

describe('createClient', () => {
  test('exposes adapter factory and removes trigger procedure API', () => {
    const client = createClient({
      authFunctions,
      schema: {} as any,
      triggers: {
        user: {
          create: {
            after: async () => {},
            before: async (data: any) => ({ data }),
          },
        },
      } as any,
    });

    expect(typeof client.adapter).toBe('function');
    expect(client.authFunctions).toBe(authFunctions);
    expect(client).not.toHaveProperty('triggersApi');
  });

  test('adapter uses db path for query ctx', async () => {
    const client = createClient({
      authFunctions,
      schema: {
        tables: {
          user: {
            export: () => ({ indexes: [] }),
            validator: {
              fields: {
                email: {},
              },
            },
          },
        },
      } as any,
    });

    const ctx = {
      db: {
        get: async () => ({ _id: 'user-1', email: 'a@b.com' }),
      },
    } as any;

    const adapterFactory = client.adapter(ctx, () => ({}) as any);
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.findOne({
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
      })
    ).resolves.toMatchObject({ id: 'user-1', email: 'a@b.com' });
  });

  test('adapter uses http path for action ctx', async () => {
    const runQuery = mock(async () => ({ _id: 'user-2', email: 'b@b.com' }));
    const client = createClient({
      authFunctions,
      schema: {
        tables: {
          user: {
            export: () => ({ indexes: [] }),
            validator: {
              fields: {
                email: {},
              },
            },
          },
        },
      } as any,
    });

    const ctx = {
      runAction: async () => {},
      runMutation: async () => {},
      runQuery,
    } as any;

    const adapterFactory = client.adapter(ctx, () => ({}) as any);
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.findOne({
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: 'user-2' }],
      })
    ).resolves.toMatchObject({ id: 'user-2', email: 'b@b.com' });
    expect(runQuery).toHaveBeenCalled();
  });

  test('adapter falls back to http path when ctx has no db', async () => {
    const runQuery = mock(async () => ({ _id: 'user-3', email: 'c@b.com' }));
    const client = createClient({
      authFunctions,
      schema: {
        tables: {
          user: {
            export: () => ({ indexes: [] }),
            validator: {
              fields: {
                email: {},
              },
            },
          },
        },
      } as any,
    });

    const ctx = {
      runQuery,
    } as any;

    const adapterFactory = client.adapter(ctx, () => ({}) as any);
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.findOne({
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: 'user-3' }],
      })
    ).resolves.toMatchObject({ id: 'user-3', email: 'c@b.com' });
    expect(runQuery).toHaveBeenCalled();
  });
});
