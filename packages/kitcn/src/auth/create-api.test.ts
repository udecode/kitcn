import { v } from 'convex/values';
import {
  createHandler,
  deleteManyHandler,
  deleteOneHandler,
  updateManyHandler,
  updateOneHandler,
} from './create-api';

const schema = {
  tables: {
    subscription: {
      export: () => ({ indexes: [] }),
      validator: {
        fields: {
          plan: v.string(),
          referenceId: v.string(),
          status: v.string(),
          stripeSubscriptionId: v.optional(v.string()),
        },
      },
    },
    users: {
      export: () => ({ indexes: [] }),
      validator: {
        fields: {
          createdAt: v.number(),
          email: v.string(),
          name: v.optional(v.string()),
          updatedAt: v.number(),
        },
      },
    },
  },
} as any;

const betterAuthSchema = {
  user: {
    fields: {
      email: { unique: false },
    },
    modelName: 'users',
  },
} as any;

const betterAuthSchemaUniqueEmail = {
  user: {
    fields: {
      email: { unique: true },
    },
    modelName: 'users',
  },
} as any;

const subscriptionBetterAuthSchema = {
  subscription: {
    fields: {
      plan: { required: true },
      referenceId: { required: true },
      status: { defaultValue: 'incomplete' },
      stripeSubscriptionId: { required: false },
    },
    modelName: 'subscription',
  },
} as any;

const createMemoryCtx = (docsById: Record<string, any>) => {
  const store = new Map<string, any>(Object.entries(docsById));

  const db = {
    delete: async (id: string) => {
      store.delete(id);
    },
    get: async (id: string) => store.get(id) ?? null,
    patch: async (id: string, update: Record<string, unknown>) => {
      const existing = store.get(id);
      if (!existing) return;
      store.set(id, { ...existing, ...update });
    },
  };

  return {
    db,
    store,
  };
};

describe('createHandler', () => {
  test('runs create.before/create.after/change triggers inline', async () => {
    const now = 1_772_802_853_052;
    using nowSpy = spyOn(Date, 'now').mockReturnValue(now);
    const insertCalls: any[] = [];
    let insertedDoc: Record<string, unknown> | undefined;
    const before = mock(async (data: any) => ({
      data: {
        ...data,
        email: 'updated@site.com',
      },
    }));
    const after = mock(async () => undefined);
    const change = mock(async () => undefined);

    const triggerCtx = { orm: true };
    const ctx = {
      db: {
        get: async (_id: string) =>
          insertedDoc ? { _id: 'user-1', ...insertedDoc } : null,
        insert: async (_model: string, data: Record<string, unknown>) => {
          insertCalls.push(data);
          insertedDoc = data;
          return 'user-1';
        },
      },
    };

    const result = await createHandler(
      ctx as any,
      {
        input: {
          data: { email: 'original@site.com', name: 'alice' },
          model: 'users',
        },
        select: ['email'],
        tableTriggers: {
          change,
          create: {
            after,
            before,
          },
        } as any,
        triggerCtx,
      },
      schema,
      betterAuthSchema
    );

    expect(insertCalls).toEqual([
      {
        createdAt: now,
        email: 'updated@site.com',
        name: 'alice',
        updatedAt: now,
      },
    ]);
    expect(nowSpy).toHaveBeenCalledTimes(1);
    expect(before).toHaveBeenCalledWith(
      {
        email: 'original@site.com',
        name: 'alice',
      },
      triggerCtx
    );
    expect(after).toHaveBeenCalledWith(
      {
        _id: 'user-1',
        createdAt: now,
        email: 'updated@site.com',
        id: 'user-1',
        name: 'alice',
        updatedAt: now,
      },
      triggerCtx
    );
    expect(change).toHaveBeenCalledWith(
      {
        id: 'user-1',
        newDoc: {
          _id: 'user-1',
          createdAt: now,
          email: 'updated@site.com',
          id: 'user-1',
          name: 'alice',
          updatedAt: now,
        },
        oldDoc: null,
        operation: 'insert',
      },
      triggerCtx
    );
    expect(result).toEqual({ email: 'updated@site.com' });
  });

  test('throws when inserted document cannot be fetched', async () => {
    await expect(
      createHandler(
        {
          db: {
            get: async () => null,
            insert: async () => 'user-1',
          },
        } as any,
        {
          input: {
            data: { email: 'a@b.com' },
            model: 'users',
          },
        },
        schema,
        betterAuthSchema
      )
    ).rejects.toThrow('Failed to create users');
  });

  test('defaults createdAt and updatedAt when auth create input omits them', async () => {
    const now = 1_772_802_853_052;
    using nowSpy = spyOn(Date, 'now').mockReturnValue(now);

    const insertCalls: Array<Record<string, unknown>> = [];
    const ctx = {
      db: {
        get: async (_id: string) => ({
          _id: 'user-1',
          createdAt: now,
          email: 'a@b.com',
          name: 'alice',
          updatedAt: now,
        }),
        insert: async (_model: string, data: Record<string, unknown>) => {
          insertCalls.push(data);
          return 'user-1';
        },
      },
    };

    const result = await createHandler(
      ctx as any,
      {
        input: {
          data: { email: 'a@b.com', name: 'alice' },
          model: 'users',
        },
      },
      schema,
      betterAuthSchema
    );

    expect(nowSpy).toHaveBeenCalledTimes(1);
    expect(insertCalls).toEqual([
      {
        createdAt: now,
        email: 'a@b.com',
        name: 'alice',
        updatedAt: now,
      },
    ]);
    expect(result).toEqual({
      _id: 'user-1',
      createdAt: now,
      email: 'a@b.com',
      id: 'user-1',
      name: 'alice',
      updatedAt: now,
    });
  });

  test('does not inject timestamps into auth plugin tables without timestamp fields', async () => {
    const now = 1_772_802_853_052;
    using nowSpy = spyOn(Date, 'now').mockReturnValue(now);

    const insertCalls: Array<Record<string, unknown>> = [];
    let insertedDoc: Record<string, unknown> | undefined;
    const ctx = {
      db: {
        get: async (_id: string) =>
          insertedDoc ? { _id: 'subscription-1', ...insertedDoc } : null,
        insert: async (_model: string, data: Record<string, unknown>) => {
          insertCalls.push(data);
          insertedDoc = data;
          return 'subscription-1';
        },
      },
    };

    const result = await createHandler(
      ctx as any,
      {
        input: {
          data: {
            plan: 'starter',
            referenceId: 'user-1',
            status: 'incomplete',
          },
          model: 'subscription',
        },
      },
      schema,
      subscriptionBetterAuthSchema
    );

    expect(nowSpy).not.toHaveBeenCalled();
    expect(insertCalls).toEqual([
      {
        plan: 'starter',
        referenceId: 'user-1',
        status: 'incomplete',
      },
    ]);
    expect(result).toMatchObject({
      _id: 'subscription-1',
      id: 'subscription-1',
      plan: 'starter',
      referenceId: 'user-1',
    });
  });

  test('throws when create.before returns false', async () => {
    await expect(
      createHandler(
        {
          db: {
            get: async () => ({ _id: 'user-1', email: 'a@b.com' }),
            insert: async () => 'user-1',
          },
        } as any,
        {
          input: {
            data: { email: 'a@b.com' },
            model: 'users',
          },
          tableTriggers: {
            create: {
              before: async () => false,
            },
          } as any,
        },
        schema,
        betterAuthSchema
      )
    ).rejects.toThrow("Auth trigger cancelled create on 'users'.");
  });
});

describe('updateOneHandler', () => {
  test('throws when document cannot be found', async () => {
    const { db } = createMemoryCtx({});

    await expect(
      updateOneHandler(
        { db } as any,
        {
          input: {
            model: 'users',
            update: { name: 'bob' },
            where: [{ field: '_id', operator: 'eq', value: 'missing' }],
          },
        },
        schema,
        betterAuthSchema
      )
    ).rejects.toThrow('Failed to update users');
  });

  test('applies update.before and runs update.after/change', async () => {
    const { db, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
    });

    const before = mock(async (update: any) => ({
      data: {
        ...update,
        name: 'bob',
      },
    }));
    const after = mock(async () => undefined);
    const change = mock(async () => undefined);

    const updated = await updateOneHandler(
      { db } as any,
      {
        input: {
          model: 'users',
          update: { name: 'ignored' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
        tableTriggers: {
          change,
          update: {
            after,
            before,
          },
        } as any,
      },
      schema,
      betterAuthSchema
    );

    expect(updated).toMatchObject({ _id: 'user-1', id: 'user-1', name: 'bob' });
    expect(store.get('user-1')).toMatchObject({ _id: 'user-1', name: 'bob' });
    expect(before).toHaveBeenCalledWith({ name: 'ignored' }, expect.anything());
    expect(after).toHaveBeenCalledWith(
      { _id: 'user-1', email: 'a@b.com', id: 'user-1', name: 'bob' },
      expect.anything()
    );
    expect(change).toHaveBeenCalledWith(
      {
        id: 'user-1',
        newDoc: { _id: 'user-1', email: 'a@b.com', id: 'user-1', name: 'bob' },
        oldDoc: {
          _id: 'user-1',
          email: 'a@b.com',
          id: 'user-1',
          name: 'alice',
        },
        operation: 'update',
      },
      expect.anything()
    );
  });

  test('strips unsupported auth timestamp fields before subscription updates', async () => {
    const patchCalls: Array<Record<string, unknown>> = [];
    const { db, store } = createMemoryCtx({
      'subscription-1': {
        _id: 'subscription-1',
        plan: 'starter',
        referenceId: 'user-1',
        status: 'active',
      },
    });
    const ctx = {
      db: {
        ...db,
        patch: async (id: string, update: Record<string, unknown>) => {
          patchCalls.push(update);
          const existing = store.get(id);
          if (!existing) {
            return;
          }
          store.set(id, { ...existing, ...update });
        },
      },
    };

    const updated = await updateOneHandler(
      ctx as any,
      {
        input: {
          model: 'subscription',
          update: {
            plan: 'pro',
            updatedAt: new Date('2026-04-22T01:22:58.000Z'),
          },
          where: [{ field: '_id', operator: 'eq', value: 'subscription-1' }],
        },
      },
      schema,
      subscriptionBetterAuthSchema
    );

    expect(patchCalls).toEqual([{ plan: 'pro' }]);
    expect(updated).toMatchObject({
      _id: 'subscription-1',
      id: 'subscription-1',
      plan: 'pro',
    });
    expect(store.get('subscription-1')).not.toHaveProperty('updatedAt');
  });
});

describe('updateManyHandler', () => {
  test('throws when attempting to set a unique field on multiple docs', async () => {
    const { db } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
      'user-2': { _id: 'user-2', email: 'c@d.com', name: 'bob' },
    });

    await expect(
      updateManyHandler(
        { db } as any,
        {
          input: {
            model: 'users',
            update: { email: 'same@site.com' },
            where: [
              { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
            ],
          },
          paginationOpts: { cursor: null, numItems: 100 },
        },
        schema,
        betterAuthSchemaUniqueEmail
      )
    ).rejects.toThrow('Attempted to set unique fields in multiple documents');
  });

  test('patches all returned docs and returns count + ids', async () => {
    const { db, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
      'user-2': { _id: 'user-2', email: 'c@d.com', name: 'bob' },
    });

    const after = mock(async () => undefined);
    const change = mock(async () => undefined);

    const result = await updateManyHandler(
      { db } as any,
      {
        input: {
          model: 'users',
          update: { name: 'updated' },
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 100 },
        tableTriggers: {
          change,
          update: {
            after,
          },
        } as any,
      },
      schema,
      betterAuthSchemaUniqueEmail
    );

    expect(store.get('user-1')?.name).toBe('updated');
    expect(store.get('user-2')?.name).toBe('updated');
    expect(after).toHaveBeenCalledTimes(2);
    expect(change).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      count: 2,
      ids: ['user-1', 'user-2'],
      isDone: true,
    });
  });
});

describe('deleteOneHandler', () => {
  test('runs delete.before/delete.after/change and returns deleted hook doc', async () => {
    const { db, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
    });

    const before = mock(async (doc: any) => ({
      data: { ...doc, name: 'transformed' },
    }));
    const after = mock(async () => undefined);
    const change = mock(async () => undefined);

    const deleted = await deleteOneHandler(
      { db } as any,
      {
        input: {
          model: 'users',
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
        tableTriggers: {
          change,
          delete: {
            after,
            before,
          },
        } as any,
      },
      schema,
      betterAuthSchema
    );

    expect(deleted).toMatchObject({
      _id: 'user-1',
      id: 'user-1',
      name: 'transformed',
    });
    expect(store.get('user-1')).toBeUndefined();
    expect(after).toHaveBeenCalledWith(
      {
        _id: 'user-1',
        email: 'a@b.com',
        id: 'user-1',
        name: 'transformed',
      },
      expect.anything()
    );
    expect(change).toHaveBeenCalledWith(
      {
        id: 'user-1',
        newDoc: null,
        oldDoc: {
          _id: 'user-1',
          email: 'a@b.com',
          id: 'user-1',
          name: 'transformed',
        },
        operation: 'delete',
      },
      expect.anything()
    );
  });

  test('returns undefined when no document matches', async () => {
    const { db } = createMemoryCtx({});
    const deleted = await deleteOneHandler(
      { db } as any,
      {
        input: {
          model: 'users',
          where: [{ field: '_id', operator: 'eq', value: 'missing' }],
        },
      },
      schema,
      betterAuthSchema
    );

    expect(deleted).toBeUndefined();
  });
});

describe('deleteManyHandler', () => {
  test('deletes all returned docs and returns count + ids', async () => {
    const { db, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
      'user-2': { _id: 'user-2', email: 'c@d.com', name: 'bob' },
    });

    const after = mock(async () => undefined);
    const change = mock(async () => undefined);

    const result = await deleteManyHandler(
      { db } as any,
      {
        input: {
          model: 'users',
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 100 },
        tableTriggers: {
          change,
          delete: {
            after,
          },
        } as any,
      },
      schema,
      betterAuthSchema
    );

    expect(store.size).toBe(0);
    expect(after).toHaveBeenCalledTimes(2);
    expect(change).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      count: 2,
      ids: ['user-1', 'user-2'],
      isDone: true,
    });
  });
});
