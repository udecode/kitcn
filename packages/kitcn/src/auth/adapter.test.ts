import type { CustomAdapter } from 'better-auth/adapters';
import * as betterAuthAdapters from 'better-auth/adapters';
import { getAuthTables } from 'better-auth/db';
import type { Where } from 'better-auth/types';
import {
  anyApi,
  type FunctionReference,
  type GenericDataModel,
  getFunctionName,
} from 'convex/server';
import { convexToJson } from 'convex/values';
import type { GenericCtx } from '../server/context-utils';
import {
  adapterConfig,
  dbAdapter,
  handlePagination,
  httpAdapter,
} from './adapter';
import type { AuthFunctions } from './create-client';

const authFunctions: AuthFunctions = {
  consumeOne: anyApi.auth.consumeOne,
  count: anyApi.auth.count,
  create: anyApi.auth.create,
  deleteMany: anyApi.auth.deleteMany,
  deleteOne: anyApi.auth.deleteOne,
  findMany: anyApi.auth.findMany,
  findOne: anyApi.auth.findOne,
  incrementOne: anyApi.auth.incrementOne,
  updateMany: anyApi.auth.updateMany,
  updateOne: anyApi.auth.updateOne,
};

const unusedByConvexAdapter = () => {
  throw new Error('unused by the Convex adapter');
};

const customAdapterOf = (createFactory: () => unknown): CustomAdapter => {
  const factory = spyOn(betterAuthAdapters, 'createAdapterFactory');
  try {
    createFactory();
    const call = factory.mock.calls[0];
    if (!call) {
      throw new Error('createAdapterFactory was not called');
    }
    return call[0].adapter({
      debugLog: unusedByConvexAdapter,
      getDefaultFieldName: unusedByConvexAdapter,
      getDefaultModelName: unusedByConvexAdapter,
      getFieldAttributes: unusedByConvexAdapter,
      getFieldName: unusedByConvexAdapter,
      getModelName: unusedByConvexAdapter,
      options: { rateLimit: { enabled: true, storage: 'database' } },
      schema: {},
      transformInput: unusedByConvexAdapter,
      transformOutput: unusedByConvexAdapter,
      transformWhereClause: unusedByConvexAdapter,
    });
  } finally {
    factory.mockRestore();
  }
};

const withModelKey = <T extends { model: string }>(input: T) => ({
  ...input,
  modelKey: input.model,
});

const whereEq = (
  field: string,
  value: string,
  connector: 'AND' | 'OR' = 'AND'
): Required<Where> => ({
  connector,
  field,
  mode: 'sensitive',
  operator: 'eq',
  value,
});

type ConvexCall = [FunctionReference<'query' | 'mutation'>, object];

const callsCarryingModelKey = (calls: ConvexCall[]) =>
  calls
    .filter(
      ([, args]) =>
        'modelKey' in args ||
        ('input' in args &&
          typeof args.input === 'object' &&
          args.input !== null &&
          'modelKey' in args.input)
    )
    .map(([fn]) => getFunctionName(fn));

const convexCtx = (fns: {
  runMutation?: (fn: ConvexCall[0], args: object) => Promise<unknown>;
  runQuery?: (fn: ConvexCall[0], args: object) => Promise<unknown>;
}) => fns as unknown as GenericCtx<GenericDataModel>;

describe('handlePagination', () => {
  test('resumes split-recommended pages after the rows they already returned', async () => {
    // A page covers [cursor, continueCursor]; splitCursor points into the middle
    // of that same page, so resuming there would replay rows.
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
    const calls: Array<{ cursor: string | null; numItems: number }> = [];

    const state = await handlePagination(
      async ({ paginationOpts }) => {
        calls.push({
          cursor: paginationOpts.cursor,
          numItems: paginationOpts.numItems,
        });
        const start = paginationOpts.cursor ? Number(paginationOpts.cursor) : 0;
        const end = Math.min(start + paginationOpts.numItems, rows.length);
        const page = rows.slice(start, end);
        const isDone = end >= rows.length;

        return {
          continueCursor: String(end),
          isDone,
          page,
          pageStatus: isDone
            ? ('Done' as const)
            : ('SplitRecommended' as const),
          splitCursor: String(start + Math.floor(page.length / 2)),
        } as any;
      },
      { limit: 10, numItems: 3 }
    );

    expect(calls).toEqual([
      { cursor: null, numItems: 3 },
      { cursor: '3', numItems: 3 },
    ]);
    expect(state.docs).toEqual(rows);
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

  test('continues unbounded pagination beyond the first 200 rows', async () => {
    let index = 0;
    const state = await handlePagination(async ({ paginationOpts }) => {
      if (paginationOpts.numItems === 0) {
        throw new Error('pagination requested zero rows');
      }

      index++;
      return {
        continueCursor: `cursor-${index}`,
        isDone: index === 2,
        page:
          index === 1
            ? Array.from({ length: 200 }, (_, id) => ({ id }))
            : [{ id: 200 }],
        pageStatus: 'Done' as const,
      };
    });

    expect(state.docs).toHaveLength(201);
  });

  test('count-only mode totals pages without retaining documents', async () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, id) => ({ id }));
    let index = 0;
    const state = await handlePagination(
      async () => {
        index++;
        return {
          continueCursor: `cursor-${index}`,
          isDone: index === 2,
          page: rows(index === 1 ? 200 : 3),
          pageStatus: 'Done' as const,
        };
      },
      { countOnly: true }
    );

    expect(state.count).toBe(203);
    expect(state.docs).toEqual([]);
    expect(state.isDone).toBe(true);
  });

  test('count-only mode still honors limit', async () => {
    const requested: number[] = [];
    const state = await handlePagination(
      async ({ paginationOpts }) => {
        requested.push(paginationOpts.numItems);
        return {
          continueCursor: `cursor-${requested.length}`,
          isDone: false,
          page: [{ id: requested.length }],
          pageStatus: 'Done' as const,
        };
      },
      { countOnly: true, limit: 2 }
    );

    expect(state.count).toBe(2);
    expect(requested).toEqual([2, 1]);
  });

  test('aborts a page that cannot make forward progress', async () => {
    let calls = 0;

    await expect(
      handlePagination(async () => {
        calls++;
        if (calls > 1) {
          throw new Error('test query cap reached');
        }

        return {
          continueCursor: null,
          isDone: false,
          page: [],
          pageStatus: 'Done' as const,
        };
      })
    ).rejects.toThrow('Pagination made no forward progress');
  });
});

describe('adapterConfig', () => {
  test('transforms date fields to unix millis for input and output', () => {
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
    expect(output).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  test('date outputs are Convex-serializable in listOrganizations-like payloads', () => {
    const createdAt = adapterConfig.customTransformOutput({
      data: '2025-10-21T19:16:12.867Z',
      field: 'createdAt',
      fieldAttributes: { type: 'date' } as any,
      model: 'organization',
      options: {} as any,
      schema: {} as any,
      select: [],
    });
    const payload = [
      {
        createdAt,
        id: 'org_1',
        logo: null,
        name: 'Acme',
        slug: 'acme',
      },
    ];

    expect(typeof createdAt).toBe('number');
    expect(() => convexToJson(payload as any)).not.toThrow();
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
  test('disables Better Auth native joins through the stable option', () => {
    const options = { advanced: { database: { joins: true } } };
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const adapterFactory = httpAdapter(
        { runQuery: mock(async () => ({})) } as any,
        { authFunctions: {} as any }
      );

      adapterFactory(options as any);

      expect(options.advanced.database.joins).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        '[kitcn] Better Auth advanced.database.joins is not supported by the Convex adapter yet. Forcing advanced.database.joins = false.'
      );
    } finally {
      warn.mockRestore();
    }
  });

  test('delegates Better Auth atomic mutations to Convex mutations', async () => {
    const authFunctions = {
      consumeOne: 'consumeOne',
      incrementOne: 'incrementOne',
    } as any;
    const runMutation = mock(async (handle: string) => {
      return handle === authFunctions.consumeOne
        ? { _id: 'verification-1', identifier: 'code' }
        : { _id: 'rate-limit-1', count: 2, key: 'sign-in' };
    });
    const adapter = httpAdapter({ runMutation } as any, { authFunctions })({
      rateLimit: { enabled: true, storage: 'database' },
    } as any);

    await expect(
      adapter.consumeOne({
        model: 'verification',
        where: [{ field: 'identifier', value: 'code' }],
      })
    ).resolves.toMatchObject({ id: 'verification-1' });
    await expect(
      adapter.incrementOne({
        increment: { count: 1 },
        model: 'rateLimit',
        where: [{ field: 'key', value: 'sign-in' }],
      })
    ).resolves.toMatchObject({ count: 2, id: 'rate-limit-1' });

    expect(runMutation).toHaveBeenNthCalledWith(1, 'consumeOne', {
      input: {
        model: 'verification',
        where: [
          {
            connector: 'AND',
            field: 'identifier',
            mode: 'sensitive',
            operator: 'eq',
            value: 'code',
          },
        ],
      },
    });
    expect(runMutation).toHaveBeenNthCalledWith(2, 'incrementOne', {
      input: {
        increment: { count: 1 },
        model: 'rateLimit',
        where: [
          {
            connector: 'AND',
            field: 'key',
            mode: 'sensitive',
            operator: 'eq',
            value: 'sign-in',
          },
        ],
      },
    });
    expect('set' in runMutation.mock.calls[1][1].input).toBe(false);
  });

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
    Object.defineProperty(ormSchema, Symbol.for('kitcn:OrmSchemaOptions'), {
      value: {},
    });

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

  test('keeps Better Auth modelKey out of Convex function args', async () => {
    const page = {
      continueCursor: null,
      isDone: true,
      page: [{ _id: 'user-1', email: 'a@b.com' }],
      pageStatus: 'Done' as const,
    };
    const runQuery = mock(async (fn: ConvexCall[0], _args: object) =>
      getFunctionName(fn) === 'auth:findMany' ? page : null
    );
    const runMutation = mock(async (_fn: ConvexCall[0], _args: object) => ({
      ...page,
      count: 1,
    }));
    const adapter = customAdapterOf(() =>
      httpAdapter(convexCtx({ runMutation, runQuery }), { authFunctions })
    );
    const where = [whereEq('email', 'a@b.com')];
    const orWhere = [
      whereEq('email', 'a@b.com', 'OR'),
      whereEq('email', 'c@d.com', 'OR'),
    ];

    for (const w of [where, orWhere]) {
      await adapter.findOne(withModelKey({ model: 'user', where: w }));
      await adapter.findMany(
        withModelKey({ limit: 10, model: 'user', where: w })
      );
      await adapter.count(withModelKey({ model: 'user', where: w }));
      await adapter.updateMany(
        withModelKey({ model: 'user', update: { name: 'a' }, where: w })
      );
    }
    await adapter.deleteMany(withModelKey({ model: 'user', where }));
    await adapter.incrementOne(
      withModelKey({
        increment: { count: 1 },
        model: 'rateLimit',
        where: [whereEq('key', 'sign-in')],
      })
    );

    const calls: ConvexCall[] = [
      ...runQuery.mock.calls,
      ...runMutation.mock.calls,
    ];
    expect(new Set(calls.map(([fn]) => getFunctionName(fn)))).toEqual(
      new Set([
        'auth:count',
        'auth:deleteMany',
        'auth:findMany',
        'auth:findOne',
        'auth:incrementOne',
        'auth:updateMany',
      ])
    );
    expect(callsCarryingModelKey(calls)).toEqual([]);
    await adapter.updateMany(
      withModelKey({
        model: 'user',
        update: { modelKey: 'application-value' },
        where,
      })
    );
    expect(runMutation.mock.calls.at(-1)?.[1]).toMatchObject({
      input: { update: { modelKey: 'application-value' } },
    });
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
      authFunctions: { count: 'count', findMany: 'findMany' } as any,
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
    // A scalar count cannot reproduce the cross-clause de-duplication, so the
    // OR branch must never reach the bounded count.
    expect(runQuery).not.toHaveBeenCalledWith('count', expect.anything());
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

  test('findMany OR path applies select after dedupe and limit', async () => {
    const runQuery = mock(async (_handle: unknown, args: any) => {
      const value = args.where?.[0]?.value;
      return {
        continueCursor: null,
        isDone: true,
        page:
          value === 'a'
            ? [{ _id: 'user-a', email: 'a' }]
            : value === 'b'
              ? [
                  { _id: 'user-b', email: 'b' },
                  { _id: 'user-a', email: 'a-duplicate' },
                ]
              : [],
        pageStatus: 'Done' as const,
      };
    });

    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { findMany: 'findMany' } as any,
    });
    const adapter = adapterFactory({} as any);

    const docs = await adapter.findMany({
      limit: 1,
      model: 'user',
      select: ['id'],
      sortBy: { direction: 'asc', field: 'email' },
      where: [
        { connector: 'OR', field: 'email', operator: 'eq', value: 'b' },
        { connector: 'OR', field: 'email', operator: 'eq', value: 'a' },
      ],
    });

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: 'user-a' });
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

  test('update returns null and skips mutation when where clause is empty', async () => {
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
        where: [],
      })
    ).resolves.toBeNull();
    expect(runMutation).not.toHaveBeenCalled();
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

  test('updateMany and deleteMany handle OR where clauses via id collection', async () => {
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
    const runMutation = mock(async (handle: unknown, args: any) => {
      if (handle === 'deleteOne') {
        return null;
      }
      if (handle === 'updateMany') {
        expect(args.input.where).toEqual([
          { field: '_id', operator: 'in', value: ['user-a', 'user-b'] },
        ]);
        return {
          continueCursor: null,
          count: 2,
          isDone: true,
          pageStatus: 'Done' as const,
        };
      }
      throw new Error(`Unexpected handle: ${String(handle)}`);
    });

    const adapterFactory = httpAdapter({ runMutation, runQuery } as any, {
      authFunctions: {
        deleteOne: 'deleteOne',
        findMany: 'findMany',
        updateMany: 'updateMany',
      } as any,
    });
    const adapter = adapterFactory({} as any);

    const where = [
      { connector: 'OR', field: 'email', operator: 'eq', value: 'a' },
      { connector: 'OR', field: 'email', operator: 'eq', value: 'b' },
    ] as any;

    const updated = await adapter.updateMany({
      model: 'user',
      update: { name: 'updated' },
      where,
    });
    expect(updated).toBe(2);

    const deleted = await adapter.deleteMany({
      model: 'user',
      where,
    });
    expect(deleted).toBe(2);
    expect(runMutation).toHaveBeenCalledWith('deleteOne', {
      input: {
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: 'user-a' }],
      },
    });
    expect(runMutation).toHaveBeenCalledWith('deleteOne', {
      input: {
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: 'user-b' }],
      },
    });
  });

  test('updateMany and deleteMany reject mixed OR and AND where clauses', async () => {
    const runQuery = mock(async () => ({}));
    const runMutation = mock(async () => undefined);
    const adapterFactory = httpAdapter({ runMutation, runQuery } as any, {
      authFunctions: {
        deleteOne: 'deleteOne',
        findMany: 'findMany',
        updateMany: 'updateMany',
      } as any,
    });
    const adapter = adapterFactory({} as any);
    const where = [
      { connector: 'AND', field: 'email', operator: 'eq', value: 'a' },
      { connector: 'OR', field: 'email', operator: 'eq', value: 'a' },
    ] as any;

    await expect(
      adapter.updateMany({
        model: 'user',
        update: { name: 'updated' },
        where,
      })
    ).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for updateMany'
    );
    await expect(
      adapter.deleteMany({
        model: 'user',
        where,
      })
    ).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for deleteMany'
    );
    expect(runQuery).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  test('count reads the bounded count instead of walking pages', async () => {
    const runQuery = mock(async (handle: unknown) => {
      if (handle !== 'count') {
        throw new Error(`findMany must not run for a bounded count: ${handle}`);
      }
      return 205;
    });
    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { count: 'count', findMany: 'findMany' } as any,
    });
    const adapter = adapterFactory({} as any);

    await expect(adapter.count({ model: 'user' })).resolves.toBe(205);
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runQuery).toHaveBeenCalledWith('count', {
      model: 'user',
      where: [],
    });
  });

  test('count totals every page when the shape cannot be bounded', async () => {
    let index = 0;
    const runQuery = mock(async (handle: unknown) => {
      // `null` is the handler telling the adapter it cannot bound this shape.
      if (handle === 'count') {
        return null;
      }

      index++;
      return {
        continueCursor: `cursor-${index}`,
        isDone: index === 2,
        page: Array.from({ length: index === 1 ? 200 : 5 }, (_, id) => ({
          _id: `user-${index}-${id}`,
          email: `user-${index}-${id}@b.com`,
        })),
        pageStatus: 'Done' as const,
      };
    });
    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { count: 'count', findMany: 'findMany' } as any,
    });
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.count({
        model: 'user',
        where: [{ field: 'email', operator: 'contains', value: '@b.com' }],
      } as any)
    ).resolves.toBe(205);
    expect(runQuery).toHaveBeenCalledTimes(3);
  });

  test('update dispatches one mutation and no pre-check query', async () => {
    const runQuery = mock(async () => ({
      continueCursor: null,
      isDone: true,
      page: [{ _id: 'user-1', name: 'alice' }],
      pageStatus: 'Done' as const,
    }));
    const runMutation = mock(async () => ({ _id: 'user-1', name: 'alice' }));
    const adapterFactory = httpAdapter({ runMutation, runQuery } as any, {
      authFunctions: { findMany: 'findMany', updateOne: 'updateOne' } as any,
    });
    const adapter = adapterFactory({} as any);

    await adapter.update({
      model: 'user',
      update: { name: 'alice' },
      where: [{ field: 'id', operator: 'eq', value: 'user-1' }],
    });

    // The multiplicity assertion lives in updateOne, on the read it already
    // performs, so the adapter must not pre-read in a second transaction.
    expect(runQuery).not.toHaveBeenCalled();
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  test('findMany and count reject mixed OR and AND where clauses', async () => {
    const runQuery = mock(async () => ({
      continueCursor: null,
      isDone: true,
      page: [{ _id: 'user-1', email: 'a@b.com' }],
      pageStatus: 'Done' as const,
    }));
    const adapterFactory = httpAdapter({ runQuery } as any, {
      authFunctions: { findMany: 'findMany' } as any,
    });
    const adapter = adapterFactory({} as any);
    const where = [
      { connector: 'AND', field: 'email', operator: 'eq', value: 'a@b.com' },
      { connector: 'OR', field: 'name', operator: 'eq', value: 'admin' },
    ] as any;

    await expect(adapter.findMany({ model: 'user', where })).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for findMany'
    );
    await expect(adapter.count({ model: 'user', where })).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for count'
    );
    expect(runQuery).not.toHaveBeenCalled();
  });
});

describe('dbAdapter', () => {
  const schema = { tables: { user: {} } } as any;
  const getBetterAuthSchema = () => getAuthTables({} as any);

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
      // Single-table fake: an id normalizes only when it names a stored row.
      normalizeId: (_table: string, id: string) => (store.has(id) ? id : null),
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

  test('incrementOne omits an absent optional set from mutation args', async () => {
    const { ctx } = createMemoryCtx({});
    const authFunctions = { incrementOne: 'incrementOne' } as any;
    ctx.runMutation = mock(async () => ({
      _id: 'rate-limit-1',
      count: 2,
      key: 'sign-in',
    }));
    const adapter = dbAdapter(ctx, {
      authFunctions,
      getBetterAuthSchema,
      schema,
    })({ rateLimit: { enabled: true, storage: 'database' } } as any);

    await adapter.incrementOne({
      increment: { count: 1 },
      model: 'rateLimit',
      where: [{ field: 'key', value: 'sign-in' }],
    });

    expect(ctx.runMutation).toHaveBeenCalledWith('incrementOne', {
      input: {
        increment: { count: 1 },
        model: 'rateLimit',
        where: [
          {
            connector: 'AND',
            field: 'key',
            mode: 'sensitive',
            operator: 'eq',
            value: 'sign-in',
          },
        ],
      },
    });
    expect('set' in ctx.runMutation.mock.calls[0][1].input).toBe(false);
  });

  test('keeps Better Auth modelKey out of Convex mutation args', async () => {
    const runMutation = mock(async (_fn: ConvexCall[0], _args: object) => ({
      continueCursor: null,
      count: 1,
      isDone: true,
      page: [],
    }));
    const adapter = customAdapterOf(() =>
      dbAdapter(convexCtx({ runMutation }), {
        authFunctions,
        getBetterAuthSchema,
        schema,
      })
    );
    const where = [whereEq('email', 'a@b.com')];

    await adapter.deleteMany(withModelKey({ model: 'user', where }));
    await adapter.updateMany(
      withModelKey({ model: 'user', update: { name: 'a' }, where })
    );
    await adapter.incrementOne(
      withModelKey({
        increment: { count: 1 },
        model: 'rateLimit',
        where: [whereEq('key', 'sign-in')],
      })
    );

    const calls: ConvexCall[] = runMutation.mock.calls;
    expect(calls.map(([fn]) => getFunctionName(fn))).toEqual([
      'auth:deleteMany',
      'auth:updateMany',
      'auth:incrementOne',
    ]);
    expect(callsCarryingModelKey(calls)).toEqual([]);
  });
  test('updateMany and deleteMany reject mixed OR and AND where clauses', async () => {
    const { ctx, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a', tenantId: 'tenant-1' },
      'user-2': { _id: 'user-2', email: 'b', tenantId: 'tenant-1' },
    });

    const adapterFactory = dbAdapter(ctx, {
      authFunctions: {
        deleteOne: 'deleteOne',
        updateMany: 'updateMany',
      } as any,
      getBetterAuthSchema,
      schema,
    });
    const adapter = adapterFactory({} as any);
    const where = [
      { connector: 'AND', field: 'email', operator: 'eq', value: 'a' },
      { connector: 'OR', field: 'email', operator: 'eq', value: 'a' },
    ] as any;

    await expect(
      adapter.updateMany({
        model: 'user',
        update: { name: 'updated' },
        where,
      })
    ).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for updateMany'
    );
    await expect(
      adapter.deleteMany({
        model: 'user',
        where,
      })
    ).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for deleteMany'
    );
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(Array.from(store.keys())).toEqual(['user-1', 'user-2']);
  });

  test('findMany and count reject mixed OR and AND where clauses', async () => {
    const { ctx } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'user' },
      'user-2': { _id: 'user-2', email: 'z@z.com', name: 'admin' },
    });

    const adapterFactory = dbAdapter(ctx, {
      authFunctions: {} as any,
      getBetterAuthSchema,
      schema,
    });
    const adapter = adapterFactory({} as any);
    const where = [
      { connector: 'AND', field: 'email', operator: 'eq', value: 'a@b.com' },
      { connector: 'OR', field: 'name', operator: 'eq', value: 'admin' },
    ] as any;

    await expect(adapter.findMany({ model: 'user', where })).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for findMany'
    );
    await expect(adapter.count({ model: 'user', where })).rejects.toThrow(
      'Mixed OR/AND where clauses are not supported for count'
    );
  });

  test('findOne OR tries each clause until a doc is found', async () => {
    const { ctx } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com' },
      'user-2': { _id: 'user-2', email: 'b@b.com' },
    });

    const adapterFactory = dbAdapter(ctx, {
      authFunctions: {} as any,
      getBetterAuthSchema,
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

  test('update returns null and skips mutation when where clause is empty', async () => {
    const { ctx, store } = createMemoryCtx({
      'user-1': { _id: 'user-1', email: 'a@b.com', name: 'Alice' },
    });

    const adapterFactory = dbAdapter(ctx, {
      authFunctions: { updateOne: 'updateOne' } as any,
      getBetterAuthSchema,
      schema,
    });
    const adapter = adapterFactory({} as any);

    await expect(
      adapter.update({
        model: 'user',
        update: { name: 'Bob' },
        where: [],
      })
    ).resolves.toBeNull();
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(store.get('user-1')).toMatchObject({ name: 'Alice' });
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

    const adapterFactory = dbAdapter(ctx, {
      authFunctions,
      getBetterAuthSchema,
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
    const adapterFactory = dbAdapter(ctx, {
      authFunctions: {} as any,
      getBetterAuthSchema,
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
    Object.defineProperty(ormSchema, Symbol.for('kitcn:OrmSchemaOptions'), {
      value: {},
    });
    const adapterFactory = dbAdapter(ctx, {
      authFunctions: {} as any,
      getBetterAuthSchema,
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
