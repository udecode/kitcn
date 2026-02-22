import {
  createHandler,
  deleteManyHandler,
  deleteOneHandler,
  updateManyHandler,
  updateOneHandler,
} from './create-api';

const schema = {
  tables: {
    users: {
      export: () => ({ indexes: [] }),
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
  test('runs beforeCreate hook, inserts document, applies select, and runs onCreate hook', async () => {
    const mutationCalls: Array<{ args: any; handle: string }> = [];
    const insertCalls: any[] = [];

    const ctx = {
      db: {
        get: async (_id: string) => ({
          _id: 'user-1',
          email: 'updated@site.com',
          name: 'alice',
        }),
        insert: async (_model: string, data: Record<string, unknown>) => {
          insertCalls.push(data);
          return 'user-1';
        },
      },
      runMutation: async (handle: string, args: any) => {
        mutationCalls.push({ args, handle });
        if (handle === 'before-hook') {
          return {
            ...args.data,
            email: 'updated@site.com',
          };
        }
      },
    };

    const result = await createHandler(
      ctx as any,
      {
        beforeCreateHandle: 'before-hook',
        input: {
          data: { email: 'original@site.com', name: 'alice' },
          model: 'users',
        },
        onCreateHandle: 'on-create-hook',
        select: ['email'],
      },
      schema,
      betterAuthSchema
    );

    expect(insertCalls).toEqual([
      {
        email: 'updated@site.com',
        name: 'alice',
      },
    ]);
    expect(mutationCalls[0]).toMatchObject({
      handle: 'before-hook',
    });
    expect(mutationCalls[1]).toMatchObject({
      handle: 'on-create-hook',
    });
    expect(mutationCalls[1]?.args).toMatchObject({
      doc: {
        _id: 'user-1',
        email: 'updated@site.com',
        id: 'user-1',
        name: 'alice',
      },
      model: 'users',
    });
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
          runMutation: async () => undefined,
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

  test('skips beforeCreate hook when skipBeforeHooks is true', async () => {
    const runMutation = spyOn(
      {
        fn: async () => undefined,
      },
      'fn'
    );

    await createHandler(
      {
        db: {
          get: async () => ({ _id: 'user-1', email: 'a@b.com' }),
          insert: async () => 'user-1',
        },
        runMutation,
      } as any,
      {
        beforeCreateHandle: 'before-hook',
        input: {
          data: { email: 'a@b.com' },
          model: 'users',
        },
        skipBeforeHooks: true,
      },
      schema,
      betterAuthSchema
    );

    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe('updateOneHandler', () => {
  test('throws when document cannot be found', async () => {
    const { db } = createMemoryCtx({});

    await expect(
      updateOneHandler(
        { db, runMutation: mock(async () => undefined) } as any,
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

  test('applies beforeUpdate hook, patches doc, and runs onUpdate hook', async () => {
    const { db, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
    });

    const mutationCalls: Array<{ args: any; handle: string }> = [];
    const runMutation = mock(async (handle: string, args: any) => {
      mutationCalls.push({ args, handle });
      if (handle === 'before-update') {
        return { ...args.update, name: 'bob' };
      }
    });

    const updated = await updateOneHandler(
      { db, runMutation } as any,
      {
        beforeUpdateHandle: 'before-update',
        input: {
          model: 'users',
          update: { name: 'ignored' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
        onUpdateHandle: 'on-update',
      },
      schema,
      betterAuthSchema
    );

    expect(updated).toMatchObject({ _id: 'user-1', id: 'user-1', name: 'bob' });
    expect(store.get('user-1')).toMatchObject({ _id: 'user-1', name: 'bob' });

    expect(mutationCalls[0]).toMatchObject({ handle: 'before-update' });
    expect(mutationCalls[0]?.args).toMatchObject({
      doc: {
        _id: 'user-1',
        email: 'a@b.com',
        id: 'user-1',
        name: 'alice',
      },
      model: 'users',
      update: { name: 'ignored' },
    });
    expect(mutationCalls[1]).toMatchObject({ handle: 'on-update' });
    expect(mutationCalls[1]?.args).toMatchObject({
      model: 'users',
      newDoc: updated,
      oldDoc: { _id: 'user-1', email: 'a@b.com', id: 'user-1', name: 'alice' },
    });
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
        { db, runMutation: mock(async () => undefined) } as any,
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

    const result = await updateManyHandler(
      { db, runMutation: mock(async () => undefined) } as any,
      {
        input: {
          model: 'users',
          update: { name: 'updated' },
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 100 },
      },
      schema,
      betterAuthSchemaUniqueEmail
    );

    expect(store.get('user-1')?.name).toBe('updated');
    expect(store.get('user-2')?.name).toBe('updated');
    expect(result).toMatchObject({
      count: 2,
      ids: ['user-1', 'user-2'],
      isDone: true,
    });
  });

  test('does not patch when input.update is missing', async () => {
    const { db, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
      'user-2': { _id: 'user-2', email: 'c@d.com', name: 'bob' },
    });
    const patchSpy = spyOn(db, 'patch');

    const result = await updateManyHandler(
      { db, runMutation: mock(async () => undefined) } as any,
      {
        input: {
          model: 'users',
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 100 },
      },
      schema,
      betterAuthSchemaUniqueEmail
    );

    expect(patchSpy).not.toHaveBeenCalled();
    expect(store.get('user-1')?.name).toBe('alice');
    expect(store.get('user-2')?.name).toBe('bob');
    expect(result).toMatchObject({ count: 2, ids: ['user-1', 'user-2'] });
  });
});

describe('deleteOneHandler', () => {
  test('runs hooks and returns the hookDoc that was deleted', async () => {
    const { db, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'alice' },
    });

    const mutationCalls: Array<{ args: any; handle: string }> = [];
    const runMutation = mock(async (handle: string, args: any) => {
      mutationCalls.push({ args, handle });
      if (handle === 'before-delete') {
        return { ...args.doc, name: 'transformed' };
      }
    });

    const deleted = await deleteOneHandler(
      { db, runMutation } as any,
      {
        beforeDeleteHandle: 'before-delete',
        input: {
          model: 'users',
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
        onDeleteHandle: 'on-delete',
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
    expect(mutationCalls[0]).toMatchObject({ handle: 'before-delete' });
    expect(mutationCalls[0]?.args).toMatchObject({
      doc: { _id: 'user-1', email: 'a@b.com', id: 'user-1', name: 'alice' },
      model: 'users',
    });
    expect(mutationCalls[1]).toMatchObject({ handle: 'on-delete' });
    expect(mutationCalls[1]?.args).toMatchObject({
      doc: {
        _id: 'user-1',
        email: 'a@b.com',
        id: 'user-1',
        name: 'transformed',
      },
      model: 'users',
    });
  });

  test('returns undefined when no document matches', async () => {
    const { db } = createMemoryCtx({});
    const deleted = await deleteOneHandler(
      { db, runMutation: mock(async () => undefined) } as any,
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

    const result = await deleteManyHandler(
      { db, runMutation: mock(async () => undefined) } as any,
      {
        input: {
          model: 'users',
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 100 },
      },
      schema,
      betterAuthSchema
    );

    expect(store.size).toBe(0);
    expect(result).toMatchObject({
      count: 2,
      ids: ['user-1', 'user-2'],
      isDone: true,
    });
  });
});
