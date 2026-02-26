import {
  adapterConfig,
  dbAdapter,
  handlePagination,
  httpAdapter,
} from './adapter';

describe('handlePagination', () => {
  test('collects pages and follows split cursor for split-recommended pages', async () => {
    const calls: Array<{ cursor: string | null; numItems: number }> = [];
    const results = [
      {
        continueCursor: 'cursor-1',
        isDone: false,
        page: [{ id: 1 }],
        pageStatus: 'SplitRecommended' as const,
        splitCursor: 'split-1',
      },
      {
        continueCursor: 'cursor-2',
        isDone: true,
        page: [{ id: 2 }],
        pageStatus: 'Done' as const,
      },
    ];

    const state = await handlePagination(
      async ({ paginationOpts }) => {
        calls.push({
          cursor: paginationOpts.cursor,
          numItems: paginationOpts.numItems,
        });
        return results[calls.length - 1] as any;
      },
      { limit: 10, numItems: 3 }
    );

    expect(calls).toEqual([
      { cursor: null, numItems: 3 },
      { cursor: 'split-1', numItems: 3 },
    ]);
    expect(state.docs).toEqual([{ id: 1 }, { id: 2 }]);
    expect(state.isDone).toBe(true);
  });

  test('stops early when limit is reached', async () => {
    let index = 0;
    const state = await handlePagination(
      async () => {
        index++;
        return {
          continueCursor: `cursor-${index}`,
          isDone: false,
          page: [{ id: index }],
          pageStatus: 'Done' as const,
        } as any;
      },
      { limit: 2 }
    );

    expect(index).toBe(2);
    expect(state.docs).toEqual([{ id: 1 }, { id: 2 }]);
    expect(state.isDone).toBe(true);
  });

  test('aggregates count-only responses for update and delete pagination', async () => {
    let index = 0;
    const state = await handlePagination(async () => {
      index++;
      return {
        continueCursor: `cursor-${index}`,
        count: 2,
        isDone: index >= 3,
        pageStatus: 'Done' as const,
      } as any;
    });

    expect(state.count).toBe(6);
    expect(state.docs).toEqual([]);
    expect(state.isDone).toBe(true);
  });
});

describe('adapterConfig', () => {
  test('transforms date fields to unix millis for input and Date for output', () => {
    const input = adapterConfig.customTransformInput({
      action: 'create',
      data: '2026-01-01T00:00:00.000Z',
      field: 'expiresAt',
      fieldAttributes: { type: 'date' } as any,
      model: 'session',
      options: {} as any,
      schema: {} as any,
    });
    const output = adapterConfig.customTransformOutput({
      data: '2026-01-01T00:00:00.000Z',
      field: 'expiresAt',
      fieldAttributes: { type: 'date' } as any,
      model: 'session',
      options: {} as any,
      schema: {} as any,
      select: [],
    });

    expect(input).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
    expect(output).toBeInstanceOf(Date);
    expect((output as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  test('returns non-date values unchanged', () => {
    const input = adapterConfig.customTransformInput({
      action: 'create',
      data: 'hello',
      field: 'name',
      fieldAttributes: { type: 'string' } as any,
      model: 'user',
      options: {} as any,
      schema: {} as any,
    });
    const output = adapterConfig.customTransformOutput({
      data: 42,
      field: 'count',
      fieldAttributes: { type: 'number' } as any,
      model: 'stats',
      options: {} as any,
      schema: {} as any,
      select: [],
    });

    expect(input).toBe('hello');
    expect(output).toBe(42);
  });
});

describe('httpAdapter', () => {
  test('createSchema keeps Convex output when schema is non-ORM', async () => {
    const adapterFactory = httpAdapter(
      { runQuery: mock(async () => ({})) } as any,
      {
        authFunctions: {} as any,
        schema: { tables: { user: {} } } as any,
      } as any
    );
    const adapter = adapterFactory({} as any);

    const result = await adapter.createSchema?.({} as any, 'auth/schema.ts');

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('createSchema should return a result');
    }
    expect(result.code).toContain('defineTable');
    expect(result.code).not.toContain('convexTable');
  });

  test('createSchema switches to ORM output when schema has ORM metadata', async () => {
    const ormSchema = { tables: { user: {} } } as any;
    Object.defineProperty(
      ormSchema,
      Symbol.for('better-convex:OrmSchemaOptions'),
      {
        value: {},
      }
    );

    const adapterFactory = httpAdapter(
      { runQuery: mock(async () => ({})) } as any,
      {
        authFunctions: {} as any,
        schema: ormSchema,
      } as any
    );
    const adapter = adapterFactory({} as any);

    const result = await adapter.createSchema?.({} as any, 'auth/schema.ts');

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('createSchema should return a result');
    }
    expect(result.code).toContain('convexTable');
    expect(result.code).not.toContain('defineTable');
  });

  test('dedupes OR queries by id for findMany and count', async () => {
    const runQuery = mock(async (_handle: unknown, args: any) => {
      const value = args.where?.[0]?.value;
      if (value === 'a' || value === 'b') {
        // Return distinct object instances with the same _id to ensure we de-dupe by id, not reference.
        return {
          continueCursor: null,
          isDone: true,
          page: [{ _id: 'user-1', email: value }],
          pageStatus: 'Done' as const,
        };
      }
      return {
        continueCursor: null,
        isDone: true,
        page: [],
        pageStatus: 'Done' as const,
      };
    });

    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { findMany: 'findMany' } as any,
    });
    const adapter = adapterFactory({} as any);

    const where = [
      { connector: 'OR', field: 'email', operator: 'eq', value: 'a' },
      { connector: 'OR', field: 'email', operator: 'eq', value: 'b' },
    ] as any;

    const docs = await adapter.findMany({ model: 'user', where });
    expect(docs.map((d: any) => d.id)).toEqual(['user-1']);

    const count = await adapter.count({ model: 'user', where });
    expect(count).toBe(1);
  });

  test('findMany throws when offset is provided', async () => {
    const adapterFactory = httpAdapter(
      { runQuery: mock(async () => ({})) } as any,
      {
        authFunctions: { findMany: 'findMany' } as any,
      }
    );
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.findMany({ model: 'user', offset: 1 })
    ).rejects.toThrow('offset not supported');
  });

  test('findMany non-OR path converts Date values to numbers via parseWhere', async () => {
    const runQuery = mock(async (_handle: unknown, args: any) => {
      expect(typeof args.where?.[0]?.value).toBe('number');
      return {
        continueCursor: null,
        isDone: true,
        page: [{ _id: 'user-1', email: 'a@b.com' }],
        pageStatus: 'Done' as const,
      };
    });

    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { findMany: 'findMany' } as any,
    });
    const adapter = adapterFactory({} as any);

    const docs = await adapter.findMany({
      model: 'user',
      where: [
        {
          // Intentionally pass a Date for a string field so Better Auth leaves it alone.
          // This exercises adapter.ts parseWhere Date handling.
          connector: 'AND',
          field: 'email',
          operator: 'eq',
          value: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });

    expect(docs.map((d: any) => d.id)).toEqual(['user-1']);
  });

  test('findMany OR path sorts results when sortBy is provided', async () => {
    const runQuery = mock(async (_handle: unknown, args: any) => {
      const value = args.where?.[0]?.value;
      return {
        continueCursor: null,
        isDone: true,
        page:
          value === 'a'
            ? [{ _id: 'user-a', email: 'a' }]
            : value === 'b'
              ? [{ _id: 'user-b', email: 'b' }]
              : [],
        pageStatus: 'Done' as const,
      };
    });

    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { findMany: 'findMany' } as any,
    });
    const adapter = adapterFactory({} as any);

    const docs = await adapter.findMany({
      limit: 10,
      model: 'user',
      sortBy: { direction: 'asc', field: 'email' },
      where: [
        { connector: 'OR', field: 'email', operator: 'eq', value: 'b' },
        { connector: 'OR', field: 'email', operator: 'eq', value: 'a' },
      ],
    });

    expect(docs.map((d: any) => d.email)).toEqual(['a', 'b']);
  });

  test('findOne returns the first truthy result when all where clauses are OR', async () => {
    const calls: unknown[] = [];
    const runQuery = mock(async (_handle: unknown, args: any) => {
      calls.push(args.where?.[0]?.value);
      const value = args.where?.[0]?.value;
      if (value === 'first') {
        return null;
      }
      if (value === 'second') {
        return { _id: 'user-2', email: 'b@b.com' };
      }
      return null;
    });

    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { findOne: 'findOne' } as any,
    });
    const adapter = adapterFactory({} as any);

    const doc = await adapter.findOne({
      model: 'user',
      where: [
        { connector: 'OR', field: 'email', operator: 'eq', value: 'first' },
        { connector: 'OR', field: 'email', operator: 'eq', value: 'second' },
      ],
    });

    expect(calls).toEqual(['first', 'second']);
    expect(doc).toMatchObject({ id: 'user-2', email: 'b@b.com' });
  });

  test('create/update/delete throw when ctx is not a mutation ctx', async () => {
    const adapterFactory = httpAdapter(
      { runQuery: mock(async () => ({})) } as any,
      {
        authFunctions: {
          create: 'create',
          deleteOne: 'deleteOne',
          updateOne: 'updateOne',
        } as any,
      }
    );
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.create({ data: { email: 'a@b.com' }, model: 'user' })
    ).rejects.toThrow('ctx is not a mutation ctx');
    await expect(
      adapter.update({
        model: 'user',
        update: { name: 'alice' },
        where: [{ field: 'id', operator: 'eq', value: 'user-1' }],
      })
    ).rejects.toThrow('ctx is not a mutation ctx');
    await expect(
      adapter.delete({
        model: 'user',
        where: [{ field: 'id', operator: 'eq', value: 'user-1' }],
      })
    ).rejects.toThrow('ctx is not a mutation ctx');
  });

  test('update throws when where clause uses unsupported operator', async () => {
    const runMutation = mock(async () => ({ _id: 'user-1', ok: true }));

    const adapterFactory = httpAdapter(
      { runMutation, runQuery: mock(async () => ({})) } as any,
      {
        authFunctions: { updateOne: 'updateOne' } as any,
      }
    );
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.update({
        model: 'user',
        update: { name: 'alice' },
        where: [{ field: 'id', operator: 'gt', value: 'user-1' }],
      })
    ).rejects.toThrow('where clause not supported');
  });

  test('updateMany and deleteMany aggregate count-only pagination results', async () => {
    const runMutation = mock(async () => ({
      continueCursor: 'cursor-1',
      count: 2,
      isDone: true,
      pageStatus: 'Done' as const,
    }));

    const adapterFactory = httpAdapter(
      { runMutation, runQuery: mock(async () => ({})) } as any,
      {
        authFunctions: {
          deleteMany: 'deleteMany',
          updateMany: 'updateMany',
        } as any,
      }
    );
    const adapter = adapterFactory({} as any);

    const updated = await adapter.updateMany({
      model: 'user',
      update: { name: 'updated' },
      where: [{ field: 'email', operator: 'eq', value: 'a@b.com' }],
    });
    expect(updated).toBe(2);

    const deleted = await adapter.deleteMany({
      model: 'user',
      where: [{ field: 'email', operator: 'eq', value: 'a@b.com' }],
    });
    expect(deleted).toBe(2);
  });
});

describe('dbAdapter', () => {
  const schema = { tables: { user: {} } } as any;

  const createMemoryCtx = (docsById: Record<string, any>) => {
    const store = new Map<string, any>(Object.entries(docsById));
    const db = {
      delete: async (id: string) => {
        store.delete(id);
      },
      get: async (id: string) => store.get(id) ?? null,
      insert: async (_model: string, data: Record<string, unknown>) => {
        const id = `user-${store.size + 1}`;
        store.set(id, { _id: id, ...data });
        return id;
      },
      patch: async (id: string, update: Record<string, unknown>) => {
        const existing = store.get(id);
        if (!existing) return;
        store.set(id, { ...existing, ...update });
      },
    };
    return {
      ctx: { db, runMutation: mock(async () => undefined) } as any,
      store,
    };
  };

  test('findOne OR tries each clause until a doc is found', async () => {
    const { ctx } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com' },
      'user-2': { _id: 'user-2', email: 'b@b.com' },
    });

    const adapterFactory = dbAdapter(ctx, () => ({}) as any, {
      authFunctions: {} as any,
      schema,
    });
    const adapter = adapterFactory({} as any);

    const doc = await adapter.findOne({
      model: 'user',
      where: [
        { connector: 'OR', field: '_id', operator: 'eq', value: 'missing' },
        { connector: 'OR', field: '_id', operator: 'eq', value: 'user-2' },
      ],
    });

    expect(doc).toMatchObject({ id: 'user-2', email: 'b@b.com' });
  });

  test('create/update/delete use handler implementations (happy path)', async () => {
    const { ctx, store } = createMemoryCtx({});
    const authFunctions = {
      create: 'create',
      deleteOne: 'deleteOne',
      updateOne: 'updateOne',
    } as any;
    ctx.runMutation = mock(async (handle: string, args: any) => {
      if (handle === authFunctions.create) {
        const id = `user-${store.size + 1}`;
        const next = { _id: id, ...(args.input.data ?? {}) };
        store.set(id, next);
        return args.select?.length
          ? Object.fromEntries(
              args.select.map((field: string) => [
                field,
                (next as Record<string, unknown>)[field],
              ])
            )
          : next;
      }

      if (handle === authFunctions.updateOne) {
        const id = args.input.where?.[0]?.value as string | undefined;
        if (!id) {
          return null;
        }
        const existing = store.get(id);
        if (!existing) {
          return null;
        }
        const next = { ...existing, ...(args.input.update ?? {}) };
        store.set(id, next);
        return { ...next, id };
      }

      if (handle === authFunctions.deleteOne) {
        const id = args.input.where?.[0]?.value as string | undefined;
        if (id) {
          store.delete(id);
        }
        return null;
      }

      return undefined;
    });

    const adapterFactory = dbAdapter(ctx, () => ({}) as any, {
      authFunctions,
      schema,
    });
    const adapter = adapterFactory({} as any);

    const created = await adapter.create({
      data: { name: 'alice' },
      model: 'user',
      select: ['name'],
    });
    expect(created).toMatchObject({ name: 'alice' });

    const id = Array.from(store.keys())[0];
    const updated = await adapter.update({
      model: 'user',
      update: { name: 'bob' },
      where: [{ field: '_id', operator: 'eq', value: id }],
    });
    expect(updated).toMatchObject({ id, name: 'bob' });

    await adapter.delete({
      model: 'user',
      where: [{ field: '_id', operator: 'eq', value: id }],
    });
    expect(store.has(id)).toBe(false);
  });

  test('createSchema keeps Convex output when schema is non-ORM', async () => {
    const { ctx } = createMemoryCtx({});
    const adapterFactory = dbAdapter(ctx, () => ({}) as any, {
      authFunctions: {} as any,
      schema: { tables: { user: {} } } as any,
    });
    const adapter = adapterFactory({} as any);

    const result = await adapter.createSchema?.({} as any, 'auth/schema.ts');

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('createSchema should return a result');
    }
    expect(result.code).toContain('defineTable');
    expect(result.code).not.toContain('convexTable');
  });

  test('createSchema switches to ORM output when schema has ORM metadata', async () => {
    const { ctx } = createMemoryCtx({});
    const ormSchema = { tables: { user: {} } } as any;
    Object.defineProperty(
      ormSchema,
      Symbol.for('better-convex:OrmSchemaOptions'),
      {
        value: {},
      }
    );
    const adapterFactory = dbAdapter(ctx, () => ({}) as any, {
      authFunctions: {} as any,
      schema: ormSchema,
    });
    const adapter = adapterFactory({} as any);

    const result = await adapter.createSchema?.({} as any, 'auth/schema.ts');

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('createSchema should return a result');
    }
    expect(result.code).toContain('convexTable');
    expect(result.code).not.toContain('defineTable');
  });
});
