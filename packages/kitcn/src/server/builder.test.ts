import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  actionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from 'convex/server';
import { z } from 'zod';

import { encodeWire } from '../crpc/transformer';
import { initCRPC } from './builder';
import { CRPCError } from './error';

function getLocationForMarker(source: string, marker: string) {
  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error(`Missing marker: ${marker}`);
  }

  const before = source.slice(0, index);
  const lines = before.split('\n');

  return {
    column: (lines.at(-1)?.length ?? 0) + 1,
    line: lines.length,
  };
}

describe('server/builder', () => {
  test('create() with no args exposes full procedure surface', () => {
    const c = initCRPC.create();

    expect('query' in c).toBe(true);
    expect('mutation' in c).toBe(true);
    expect('action' in c).toBe(true);
    expect('httpAction' in c).toBe(true);
    expect(() => c.query.internal()).not.toThrow();
    expect(() => c.mutation.internal()).not.toThrow();
    expect(() => c.action.internal()).not.toThrow();
  });

  test('internal queries set _crpcMeta.internal=true', () => {
    const c = initCRPC.create();

    const fn = c.query
      .internal()
      .meta({ auth: 'required' })
      .input(z.object({ x: z.number() }))
      .query(async ({ input }) => input.x);

    expect((fn as any)._crpcMeta).toMatchObject({
      type: 'query',
      internal: true,
      auth: 'required',
    });
  });

  test('middleware can override ctx and input and getRawInput returns original args', async () => {
    const c = initCRPC
      .context({
        query: (_ctx) => ({ userId: null as string | null }),
        mutation: (_ctx) => ({ userId: null as string | null }),
      })
      .create({
        query: queryGeneric,
        internalQuery: internalQueryGeneric,
        mutation: mutationGeneric,
        internalMutation: internalMutationGeneric,
      } as any);

    const withAuth = c.query.use(async ({ ctx, input, getRawInput, next }) => {
      expect(await getRawInput()).toEqual({ x: 1 });
      expect(input).toEqual({ x: 1 });
      return next({ ctx: { ...ctx, userId: 'u1' }, input: { x: 2 } });
    });

    const fn = withAuth
      .input(z.object({ x: z.number() }))
      .query(async ({ ctx, input }) => ({
        userId: (ctx as any).userId,
        x: input.x,
      }));

    await expect((fn as any)._handler({}, { x: 1 })).resolves.toEqual({
      userId: 'u1',
      x: 2,
    });
  });

  test('middleware receives procedure info from server-only procedure name', async () => {
    const seen: unknown[] = [];
    const c = initCRPC
      .context({
        query: () => ({ userId: null as string | null }),
      })
      .create({
        query: queryGeneric,
        internalQuery: internalQueryGeneric,
      } as any);

    const fn = c.query
      .name('posts:list')
      .use(async ({ ctx, procedure, next }) => {
        seen.push(procedure);
        return next({ ctx });
      })
      .query(async () => 'ok');

    await expect((fn as any)._handler({}, {})).resolves.toBe('ok');
    expect(seen).toEqual([{ type: 'query', name: 'posts:list' }]);
    expect((fn as any)._crpcMeta).not.toHaveProperty('name');
  });

  test('middleware infers procedure info from exported module path by default', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-procedure-name-'));
    const functionsDir = path.join(dir, 'convex', 'functions');
    const filePath = path.join(functionsDir, 'posts.ts');
    const serverUrl = pathToFileURL(
      path.join(process.cwd(), 'packages/kitcn/src/server/index.ts')
    ).href;
    const source = `
      import { queryGeneric, internalQueryGeneric } from 'convex/server';
      import { initCRPC } from './generated/server';

      export const seen = [];

      const c = initCRPC
        .context({
          query: () => ({ userId: null }),
        })
        .create({
          query: queryGeneric,
          internalQuery: internalQueryGeneric,
        });

      export const list = c.query
        .use(async ({ ctx, procedure, next }) => {
          seen.push(procedure);
          return next({ ctx });
        })
        .query(async () => 'ok');
      `;
    const location = getLocationForMarker(source, ".query(async () => 'ok')");

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.mkdirSync(path.join(functionsDir, 'generated'), { recursive: true });
    fs.symlinkSync(
      path.join(process.cwd(), 'node_modules'),
      path.join(dir, 'node_modules'),
      'dir'
    );
    fs.writeFileSync(
      path.join(dir, 'convex.json'),
      `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(functionsDir, 'generated', 'server.ts'),
      `
      import {
        initCRPC as baseInitCRPC,
        registerProcedureNameLookup,
      } from ${JSON.stringify(serverUrl)};

      registerProcedureNameLookup(
        {
          'posts.ts': [
            {
              column: ${location.column},
              line: ${location.line},
              name: 'posts:list',
            },
          ],
        },
        'convex/functions'
      );

      export const initCRPC = baseInitCRPC;
      `
    );
    fs.writeFileSync(filePath, source);

    const mod = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);

    await expect((mod as any).list._handler({}, {})).resolves.toBe('ok');
    expect((mod as any).seen).toEqual([{ type: 'query', name: 'posts:list' }]);
  });

  test('middleware infers procedure info with default convex root when convex.json is absent', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-procedure-name-default-root-')
    );
    const functionsDir = path.join(dir, 'convex');
    const filePath = path.join(functionsDir, 'posts.ts');
    const serverUrl = pathToFileURL(
      path.join(process.cwd(), 'packages/kitcn/src/server/index.ts')
    ).href;
    const source = `
      import { queryGeneric, internalQueryGeneric } from 'convex/server';
      import { initCRPC } from './generated/server';

      export const seen = [];

      const c = initCRPC
        .context({
          query: () => ({ userId: null }),
        })
        .create({
          query: queryGeneric,
          internalQuery: internalQueryGeneric,
        });

      export const list = c.query
        .use(async ({ ctx, procedure, next }) => {
          seen.push(procedure);
          return next({ ctx });
        })
        .query(async () => 'ok');
      `;
    const location = getLocationForMarker(source, ".query(async () => 'ok')");

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.mkdirSync(path.join(functionsDir, 'generated'), { recursive: true });
    fs.symlinkSync(
      path.join(process.cwd(), 'node_modules'),
      path.join(dir, 'node_modules'),
      'dir'
    );
    fs.writeFileSync(
      path.join(functionsDir, 'generated', 'server.ts'),
      `
      import {
        initCRPC as baseInitCRPC,
        registerProcedureNameLookup,
      } from ${JSON.stringify(serverUrl)};

      registerProcedureNameLookup(
        {
          'posts.ts': [
            {
              column: ${location.column},
              line: ${location.line},
              name: 'posts:list',
            },
          ],
        },
        'convex'
      );

      export const initCRPC = baseInitCRPC;
      `
    );
    fs.writeFileSync(filePath, source);

    const mod = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);

    await expect((mod as any).list._handler({}, {})).resolves.toBe('ok');
    expect((mod as any).seen).toEqual([{ type: 'query', name: 'posts:list' }]);
  });

  test('input schemas are merged when chained', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(z.object({ a: z.string() }))
      .input(z.object({ b: z.number() }))
      .query(async ({ input }) => input);

    await expect((fn as any)._handler({}, { a: 'x', b: 1 })).resolves.toEqual({
      a: 'x',
      b: 1,
    });

    await expect((fn as any)._handler({}, { a: 'x' })).rejects.toBeTruthy();
  });

  test('paginated() records limit in _crpcMeta', () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .paginated({ limit: 10, item: z.object({ id: z.string() }) })
      .query(async ({ input }) => ({
        continueCursor: 'c',
        isDone: true,
        page: [{ id: String(input.limit) }],
      }));

    expect((fn as any)._crpcMeta).toMatchObject({ type: 'query', limit: 10 });
  });

  test('defaultMeta is applied and meta() merges values', () => {
    const c = initCRPC
      .meta<{ auth?: string; tag?: string; extra?: string }>()
      .create({
        defaultMeta: { auth: 'optional' },
        query: queryGeneric,
        mutation: mutationGeneric,
      } as any);

    const fn = c.query
      .meta({ tag: 't1' })
      .meta({ extra: 't2' })
      .query(async () => 'ok');

    expect((fn as any)._crpcMeta).toMatchObject({
      type: 'query',
      internal: false,
      auth: 'optional',
      tag: 't1',
      extra: 't2',
    });
  });

  test('c.middleware().pipe() can be passed to .use()', async () => {
    const c = initCRPC
      .context({
        query: () => ({ userId: null as string | null }),
        mutation: () => ({ userId: null as string | null }),
      })
      .create({
        query: queryGeneric,
        mutation: mutationGeneric,
      } as any);

    const withUser = c.middleware(({ ctx, next }) =>
      next({ ctx: { ...ctx, userId: 'u1' } })
    );

    const withRole = withUser.pipe(({ ctx, next }) =>
      next({ ctx: { ...ctx, role: 'admin' } })
    );

    const fn = c.query
      .use(withRole as any)
      .input(z.object({ x: z.number() }))
      .query(async ({ ctx, input }) => ({
        userId: (ctx as any).userId,
        role: (ctx as any).role,
        x: input.x,
      }));

    await expect((fn as any)._handler({}, { x: 1 })).resolves.toEqual({
      userId: 'u1',
      role: 'admin',
      x: 1,
    });
  });

  test('query.output() validates returns schema', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const ok = c.query
      .output(z.object({ ok: z.literal(true) }))
      .query(async () => ({ ok: true }));

    await expect((ok as any)._handler({}, {})).resolves.toEqual({ ok: true });

    const bad = c.query
      .output(z.object({ ok: z.literal(true) }))
      .query(async () => ({ ok: false }) as any);

    await expect((bad as any)._handler({}, {})).rejects.toBeTruthy();
  });

  test('paginated() clamps limit and defaults cursor', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .paginated({ limit: 10, item: z.object({ id: z.string() }) })
      .query(async ({ input }) => ({
        continueCursor: 'next',
        isDone: true,
        page: [{ id: `${input.limit}:${String((input as any).cursor)}` }],
      }));

    await expect(
      (fn as any)._handler({}, { limit: 999 })
    ).resolves.toMatchObject({
      page: [{ id: '10:null' }],
    });

    await expect(
      (fn as any)._handler({}, { cursor: 'c1', limit: 5 })
    ).resolves.toMatchObject({
      page: [{ id: '5:c1' }],
    });
  });

  test('mutation.internal() is available by default', async () => {
    const c = initCRPC.create();
    const fn = c.mutation
      .internal()
      .input(z.object({ x: z.number() }))
      .mutation(async ({ input }) => input.x);

    await expect((fn as any)._handler({}, { x: 42 })).resolves.toBe(42);
  });

  test('mutation builder supports use(), output(), and internal() meta', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      internalQuery: internalQueryGeneric,
      mutation: mutationGeneric,
      internalMutation: internalMutationGeneric,
    } as any);

    const fn = c.mutation
      .use(async ({ ctx, next }) => next({ ctx: { ...ctx, flag: true } }))
      .internal()
      .meta({ tag: 'm' } as any)
      .input(z.object({ x: z.number() }))
      .output(z.object({ x: z.number(), flag: z.boolean() }))
      .mutation(async ({ ctx, input }) => ({
        x: input.x,
        flag: (ctx as any).flag,
      }));

    expect((fn as any)._crpcMeta).toMatchObject({
      type: 'mutation',
      internal: true,
      tag: 'm',
    });

    await expect((fn as any)._handler({}, { x: 1 })).resolves.toEqual({
      x: 1,
      flag: true,
    });

    const bad = c.mutation
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async () => ({ ok: false }) as any);

    await expect((bad as any)._handler({}, {})).rejects.toBeTruthy();
  });

  test('create() applies configured mutation context enrichment', async () => {
    const c = initCRPC
      .context({
        mutation: (ctx) => ({ stage: (ctx as any).stage }),
        query: (ctx) => ctx,
      })
      .create({
        query: queryGeneric,
        mutation: mutationGeneric,
      } as any);

    const fn = c.mutation.mutation(
      async ({ ctx }) => (ctx as any).stage ?? 'raw'
    );
    await expect((fn as any)._handler({ stage: 'wrapped' }, {})).resolves.toBe(
      'wrapped'
    );
  });

  test('mutation context sanitizes runMutation args for Convex-safe values', async () => {
    const runMutation = mock(async () => null);
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.mutation.mutation(async ({ ctx }) => {
      await (ctx as any).runMutation('internal.auth.beforeCreate', {
        data: {
          createdAt: new Date(1_700_000_000_000),
          image: undefined,
          nested: {
            optional: undefined,
            updatedAt: new Date(1_700_000_000_100),
          },
          tags: [1, undefined, new Date(1_700_000_000_200)],
        },
      });

      return null;
    });

    await (fn as any)._handler({ runMutation }, {});

    expect(runMutation).toHaveBeenCalledWith('internal.auth.beforeCreate', {
      data: {
        createdAt: 1_700_000_000_000,
        nested: {
          updatedAt: 1_700_000_000_100,
        },
        tags: [1, null, 1_700_000_000_200],
      },
    });
  });

  test('action.internal() is available by default', async () => {
    const c = initCRPC.create();
    const fn = c.action
      .internal()
      .input(z.object({ x: z.number() }))
      .action(async ({ input }) => input.x);

    await expect((fn as any)._handler({}, { x: 7 })).resolves.toBe(7);
  });

  test('explicit mutation/internalMutation overrides default builders', () => {
    const mutationOverride = mock((cfg: any) => mutationGeneric(cfg));
    const internalMutationOverride = mock((cfg: any) =>
      internalMutationGeneric(cfg)
    );

    const c = initCRPC.create({
      mutation: mutationOverride as any,
      internalMutation: internalMutationOverride as any,
    });

    c.mutation.mutation(async () => null);
    c.mutation.internal().mutation(async () => null);

    expect(mutationOverride).toHaveBeenCalledTimes(1);
    expect(internalMutationOverride).toHaveBeenCalledTimes(1);
  });

  test('action builder supports use(), output(), and internal() meta', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
      action: actionGeneric,
      internalAction: internalActionGeneric,
    } as any);

    const fn = (c as any).action
      .use(async ({ ctx, next }: any) => next({ ctx: { ...ctx, flag: true } }))
      .internal()
      .meta({ tag: 'a' } as any)
      .input(z.object({ x: z.number() }))
      .output(z.object({ x: z.number(), flag: z.boolean() }))
      .action(async ({ ctx, input }: any) => ({
        x: input.x,
        flag: (ctx as any).flag,
      }));

    expect((fn as any)._crpcMeta).toMatchObject({
      type: 'action',
      internal: true,
      tag: 'a',
    });

    await expect((fn as any)._handler({}, { x: 1 })).resolves.toEqual({
      x: 1,
      flag: true,
    });
  });

  test('initCRPC entrypoints (dataModel/meta/context.meta) are callable', () => {
    expect(initCRPC.dataModel<any>()).toBeTruthy();
    expect(initCRPC.meta<{ tag?: string }>()).toBeTruthy();

    const c = initCRPC
      .context({
        query: () => ({ ok: true }),
        mutation: () => ({ ok: true }),
      })
      .meta<{ auth?: string }>()
      .create({
        defaultMeta: { auth: 'required' },
        query: queryGeneric,
        mutation: mutationGeneric,
      } as any);

    const fn = c.query.query(async ({ ctx }) => (ctx as any).ok);
    expect((fn as any)._crpcMeta).toMatchObject({ auth: 'required' });
  });

  test('encodes Date outputs to wire-safe payloads', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const now = new Date(1_700_000_000_000);
    const fn = c.query.output(z.date()).query(async () => now);

    await expect((fn as any)._handler({}, {})).resolves.toEqual(
      encodeWire(now)
    );
  });

  test('decodes wire Date inputs before handler execution', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(z.object({ at: z.date() }))
      .query(async ({ input }) => input.at instanceof Date);

    await expect(
      (fn as any)._handler({}, encodeWire({ at: new Date(1_700_000_000_000) }))
    ).resolves.toBe(true);

    await expect(
      (fn as any)._handler({}, { at: 1_700_000_000_000 })
    ).rejects.toBeTruthy();
  });

  test('respects custom transformer for input decode and output serialize', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
      transformer: {
        input: {
          serialize: (value: unknown) => value,
          deserialize: (value: unknown) => {
            if (
              value &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              'x' in value &&
              (value as any).x &&
              typeof (value as any).x === 'object' &&
              '$in' in (value as any).x
            ) {
              return { ...(value as any), x: (value as any).x.$in };
            }
            return value;
          },
        },
        output: {
          serialize: (value: unknown) => ({ $out: value }),
          deserialize: (value: unknown) => value,
        },
      },
    } as any);

    const fn = c.query
      .input(z.object({ x: z.any() }))
      .query(async ({ input }) => ({ x: input.x + 1 }));

    await expect((fn as any)._handler({}, { x: { $in: 1 } })).resolves.toEqual({
      $out: { x: 2 },
    });
  });

  test('handler try/catch maps APIError-like errors to CRPCError', async () => {
    class FakeAPIError extends Error {
      statusCode = 404;
      status = 'NOT_FOUND';
      body = { message: 'not found from api' };

      constructor() {
        super('api failed');
        this.name = 'APIError';
      }
    }

    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query.query(async () => {
      throw new FakeAPIError();
    });

    await expect((fn as any)._handler({}, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'not found from api',
      name: 'CRPCError',
    });
  });

  test('handler try/catch rethrows unknown errors unchanged', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const cause = new Error('unexpected boom');
    const fn = c.query.query(async () => {
      throw cause;
    });

    await expect((fn as any)._handler({}, {})).rejects.toBe(cause);
    await expect((fn as any)._handler({}, {})).rejects.not.toBeInstanceOf(
      CRPCError
    );
  });
});
