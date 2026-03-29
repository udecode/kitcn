import { describe, expect, test } from 'bun:test';
import { definePlugin } from '../plugins';
import { CRPCError, initCRPC } from '../server';
import { MINUTE, Ratelimit, RatelimitPlugin } from './index';
import type { ConvexRatelimitDbWriter, LimitRequest } from './types';

type TableRow = Record<string, unknown> & {
  _id: string;
  _creationTime: number;
};

function createMockDb(): ConvexRatelimitDbWriter {
  const tables = new Map<string, TableRow[]>();

  const getTable = (name: string) => {
    const table = tables.get(name);
    if (table) {
      return table;
    }
    const created: TableRow[] = [];
    tables.set(name, created);
    return created;
  };

  return {
    query(tableName: string) {
      const table = getTable(tableName);
      return {
        withIndex(_name, cb) {
          const filters: Array<{ field: string; value: unknown }> = [];
          cb({
            eq(field: string, value: unknown) {
              filters.push({ field, value });
              return this;
            },
          });

          const filtered = () =>
            table.filter((row) =>
              filters.every((filter) => row[filter.field] === filter.value)
            );

          return {
            async unique() {
              return filtered()[0] ?? null;
            },
            async collect() {
              return filtered();
            },
          };
        },
      };
    },
    async insert(tableName, value) {
      const table = getTable(tableName);
      const id = `${tableName}_${table.length + 1}`;
      table.push({
        _id: id,
        _creationTime: Date.now(),
        ...value,
      } as TableRow);
      return id;
    },
    async patch(id, value) {
      for (const table of tables.values()) {
        const row = table.find((candidate) => candidate._id === id);
        if (row) {
          Object.assign(row, value);
          return;
        }
      }
      throw new Error(`Row not found: ${id}`);
    },
    async delete(tableName, id) {
      const table = getTable(tableName);
      const index = table.findIndex((row) => row._id === id);
      if (index >= 0) {
        table.splice(index, 1);
      }
    },
  };
}

type TestUser = {
  id: string;
  plan?: 'premium' | null;
};

type TestCtx = {
  db: ConvexRatelimitDbWriter;
  scheduler: {};
  user: TestUser | null;
};

type TestMeta = {
  ratelimit?: 'default' | 'interactive';
};

const fixed = (rate: number) => Ratelimit.fixedWindow(rate, MINUTE);

function createConfiguredPlugin(options?: {
  onSignals?: (request: LimitRequest | undefined) => void;
}) {
  return RatelimitPlugin.configure({
    buckets: {
      default: {
        public: fixed(1),
        free: fixed(1),
        premium: fixed(2),
      },
      interactive: {
        public: fixed(1),
        free: fixed(1),
        premium: fixed(1),
      },
    },
    getBucket: ({ meta }: { meta: TestMeta }) => meta.ratelimit ?? 'default',
    getUser: ({ ctx }: { ctx: TestCtx }) => ctx.user,
    getIdentifier: ({ user }: { user: TestUser | null }) =>
      user?.id ?? 'anonymous',
    getTier: (user: TestUser | null) => (user?.plan ? 'premium' : 'free'),
    getSignals: ({ user }: { user: TestUser | null }) => {
      const request = {
        ip: user ? '127.0.0.1' : '127.0.0.2',
        userAgent: 'bun:test',
      } satisfies LimitRequest;
      options?.onSignals?.(request);
      return request;
    },
    failureMode: 'closed',
    enableProtection: true,
    denyListThreshold: 30,
    prefix: ({ bucket, tier }) => `ratelimit:${bucket}:${tier}`,
  });
}

describe('RatelimitPlugin', () => {
  test('middleware() injects ctx.api.ratelimit and uses default bucket when unset', async () => {
    const db = createMockDb();
    const plugin = createConfiguredPlugin();
    const c = initCRPC
      .context({
        mutation: () =>
          ({
            db,
            scheduler: {},
            user: null,
          }) satisfies TestCtx,
      })
      .meta<TestMeta>()
      .create();

    const proc = c.mutation
      .use(plugin.middleware())
      .mutation(async ({ ctx }) => ctx.api.ratelimit.buckets.default.free.kind);

    await expect((proc as any)._handler({}, {})).resolves.toBe('fixedWindow');
  });

  test('middleware() uses configured bucket resolver and throws CRPCError on limit failure', async () => {
    const db = createMockDb();
    const plugin = createConfiguredPlugin();
    const c = initCRPC
      .context({
        mutation: () =>
          ({
            db,
            scheduler: {},
            user: null,
          }) satisfies TestCtx,
      })
      .meta<TestMeta>()
      .create();

    const proc = c.mutation
      .meta({ ratelimit: 'interactive' })
      .use(plugin.middleware())
      .mutation(async () => 'ok');

    await expect((proc as any)._handler({}, {})).resolves.toBe('ok');
    await expect((proc as any)._handler({}, {})).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
    } satisfies Partial<CRPCError>);
  });

  test('middleware() uses configured tier resolver', async () => {
    const db = createMockDb();
    const plugin = createConfiguredPlugin();
    const c = initCRPC
      .context({
        mutation: () =>
          ({
            db,
            scheduler: {},
            user: {
              id: 'user-1',
              plan: 'premium',
            },
          }) satisfies TestCtx,
      })
      .meta<TestMeta>()
      .create();

    const proc = c.mutation.use(plugin.middleware()).mutation(async () => 'ok');

    await expect((proc as any)._handler({}, {})).resolves.toBe('ok');
    await expect((proc as any)._handler({}, {})).resolves.toBe('ok');
    await expect((proc as any)._handler({}, {})).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    } satisfies Partial<CRPCError>);
  });

  test('middleware() uses configured signal resolver', async () => {
    const db = createMockDb();
    let request: LimitRequest | undefined;
    const plugin = createConfiguredPlugin({
      onSignals: (nextRequest) => {
        request = nextRequest;
      },
    });
    const c = initCRPC
      .context({
        mutation: () =>
          ({
            db,
            scheduler: {},
            user: {
              id: 'user-2',
              plan: null,
            },
          }) satisfies TestCtx,
      })
      .meta<TestMeta>()
      .create();

    const proc = c.mutation.use(plugin.middleware()).mutation(async () => 'ok');

    await expect((proc as any)._handler({}, {})).resolves.toBe('ok');
    expect(request).toEqual({
      ip: '127.0.0.1',
      userAgent: 'bun:test',
    });
  });

  test('extend() can coexist with named middleware presets', async () => {
    const db = createMockDb();
    const plugin = createConfiguredPlugin().extend(({ middleware }) => ({
      tagged: () =>
        middleware().pipe(async ({ ctx, next }) =>
          next({
            ctx: {
              ...ctx,
              tag: 'tagged' as const,
            },
          })
        ),
    }));

    const c = initCRPC
      .context({
        mutation: () =>
          ({
            db,
            scheduler: {},
            user: null,
          }) satisfies TestCtx,
      })
      .meta<TestMeta>()
      .create();

    const proc = c.mutation
      .use(plugin.middleware())
      .use(plugin.tagged())
      .mutation(async ({ ctx }) => (ctx as typeof ctx & { tag: 'tagged' }).tag);

    await expect((proc as any)._handler({}, {})).resolves.toBe('tagged');
  });
});
