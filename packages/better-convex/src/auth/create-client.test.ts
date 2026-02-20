import { createClient } from './create-client';

const authFunctions = {
  beforeCreate: 'beforeCreate',
  beforeDelete: 'beforeDelete',
  beforeUpdate: 'beforeUpdate',
  create: 'create',
  deleteMany: 'deleteMany',
  deleteOne: 'deleteOne',
  findMany: 'findMany',
  findOne: 'findOne',
  onCreate: 'onCreate',
  onDelete: 'onDelete',
  onUpdate: 'onUpdate',
  updateMany: 'updateMany',
  updateOne: 'updateOne',
} as any;

describe('createClient', () => {
  test('creates trigger API handlers that call configured trigger callbacks', async () => {
    const captured: any[] = [];
    const internalMutation = ((config: any) => {
      captured.push(config);
      return config;
    }) as any;

    const triggers = {
      user: {
        beforeCreate: async (data: any) => ({
          ...data,
          tagged: true,
        }),
        beforeDelete: async (doc: any) => ({
          ...doc,
          deletedByHook: true,
        }),
        beforeUpdate: async (_doc: any, update: any) => ({
          ...update,
          updatedByHook: true,
        }),
        onCreate: async (_doc: any) => {},
        onDelete: async (_doc: any) => {},
        onUpdate: async (_newDoc: any, _oldDoc: any) => {},
      },
    } as any;

    const client = createClient({
      authFunctions,
      internalMutation,
      schema: {} as any,
      triggers,
    });
    const api = client.triggersApi() as any;

    expect(captured).toHaveLength(6);

    const beforeCreate = await api.beforeCreate.handler(
      {},
      { data: { email: 'a@b.com' }, model: 'user' }
    );
    const beforeDelete = await api.beforeDelete.handler(
      {},
      { doc: { _id: 'u1' }, model: 'user' }
    );
    const beforeUpdate = await api.beforeUpdate.handler(
      {},
      {
        doc: { _id: 'u1' },
        model: 'user',
        update: { name: 'new' },
      }
    );

    expect(beforeCreate).toEqual({ email: 'a@b.com', tagged: true });
    expect(beforeDelete).toEqual({ _id: 'u1', deletedByHook: true });
    expect(beforeUpdate).toEqual({ name: 'new', updatedByHook: true });
  });

  test('falls back to original values when trigger callback is missing', async () => {
    const internalMutation = ((config: any) => config) as any;

    const client = createClient({
      authFunctions,
      internalMutation,
      schema: {} as any,
      triggers: {},
    });
    const api = client.triggersApi() as any;

    const beforeCreate = await api.beforeCreate.handler(
      {},
      { data: { email: 'a@b.com' }, model: 'missing' }
    );
    const beforeDelete = await api.beforeDelete.handler(
      {},
      { doc: { _id: 'u1' }, model: 'missing' }
    );
    const beforeUpdate = await api.beforeUpdate.handler(
      {},
      {
        doc: { _id: 'u1' },
        model: 'missing',
        update: { name: 'new' },
      }
    );

    expect(beforeCreate).toEqual({ email: 'a@b.com' });
    expect(beforeDelete).toEqual({ _id: 'u1' });
    expect(beforeUpdate).toEqual({ name: 'new' });
  });

  test('applies context before executing trigger callbacks', async () => {
    const internalMutation = ((config: any) => config) as any;

    const beforeCreate = mock(async (data: any) => ({
      ...data,
      usedOrm: true,
    }));

    const client = createClient({
      authFunctions,
      internalMutation,
      schema: {} as any,
      context: async (ctx: any) => ({ ...ctx, orm: true }),
      triggers: (ctx: any) => ({
        user: {
          beforeCreate: async (data: any) => {
            expect(ctx.orm).toBe(true);
            return beforeCreate(data);
          },
        },
      }),
    });

    const api = client.triggersApi() as any;

    const result = await api.beforeCreate.handler(
      { db: {} },
      { data: { email: 'a@b.com' }, model: 'user' }
    );

    expect(beforeCreate).toHaveBeenCalled();
    expect(result).toEqual({ email: 'a@b.com', usedOrm: true });
  });

  test('applies context transforms for trigger callbacks', async () => {
    const beforeCreate = mock(async (data: any) => ({
      ...data,
      transformed: true,
    }));

    const client = createClient({
      authFunctions,
      schema: {} as any,
      context: async (ctx: any) => ({
        ...ctx,
        contextWrapped: true,
      }),
      triggers: (ctx: any) => ({
        user: {
          beforeCreate: async (data: any) => {
            expect(ctx.contextWrapped).toBe(true);
            return beforeCreate(data);
          },
        },
      }),
    });

    const api = client.triggersApi() as any;
    const result = await api.beforeCreate._handler(
      { db: {} },
      { data: { email: 'a@b.com' }, model: 'user' }
    );

    expect(beforeCreate).toHaveBeenCalled();
    expect(result).toEqual({
      email: 'a@b.com',
      transformed: true,
    });
  });

  test('exposes adapter factory', () => {
    const client = createClient({
      authFunctions,
      schema: {} as any,
    });

    expect(typeof client.adapter).toBe('function');
    expect(client.authFunctions).toBe(authFunctions);
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
