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

  test('next({ input }) is honored from any position in the middleware chain', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const passthrough = async ({ ctx, next }: any) => next({ ctx });
    const enrich = async ({ ctx, next }: any) =>
      next({ ctx, input: { x: 99 } });

    const enrichFirst = c.query
      .input(z.object({ x: z.number() }))
      .use(enrich)
      .use(passthrough)
      .query(async ({ input }) => input.x);

    const enrichSecond = c.query
      .input(z.object({ x: z.number() }))
      .use(passthrough)
      .use(enrich)
      .query(async ({ input }) => input.x);

    await expect((enrichFirst as any)._handler({}, { x: 1 })).resolves.toBe(99);
    await expect((enrichSecond as any)._handler({}, { x: 1 })).resolves.toBe(
      99
    );
  });

  test('middleware wrapping next() observes the resolver', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const events: string[] = [];
    let elapsed = -1;

    const fn = c.query
      .use(async ({ ctx, next }) => {
        const start = Date.now();
        events.push('middleware-start');
        try {
          return await next({ ctx });
        } finally {
          elapsed = Date.now() - start;
          events.push('middleware-end');
        }
      })
      .query(async () => {
        events.push('handler-start');
        await new Promise((resolve) => setTimeout(resolve, 30));
        events.push('handler-end');
        return 'ok';
      });

    await expect((fn as any)._handler({}, {})).resolves.toBe('ok');
    expect(events).toEqual([
      'middleware-start',
      'handler-start',
      'handler-end',
      'middleware-end',
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  test('middleware wrapping next() catches resolver errors', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const reported: string[] = [];

    const fn = c.query
      .use(async ({ ctx, next }) => {
        try {
          return await next({ ctx });
        } catch (error) {
          reported.push((error as Error).message);
          throw error;
        }
      })
      .query(async () => {
        throw new CRPCError({ code: 'NOT_FOUND', message: 'missing' });
      });

    await expect((fn as any)._handler({}, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(reported).toEqual(['missing']);
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

  test('object-level .refine() on an input schema is enforced', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(
        z
          .object({ password: z.string(), confirm: z.string() })
          .refine((v) => v.password === v.confirm, {
            message: 'Passwords must match',
          })
      )
      .query(async ({ input }) => input.password);

    await expect(
      (fn as any)._handler({}, { password: 'a', confirm: 'a' })
    ).resolves.toBe('a');

    await expect(
      (fn as any)._handler({}, { password: 'a', confirm: 'b' })
    ).rejects.toBeTruthy();
  });

  test('object-level .superRefine() on an input schema is enforced', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(
        z
          .object({ start: z.number(), end: z.number() })
          .superRefine((v, ctx) => {
            if (v.end <= v.start) {
              ctx.addIssue({
                code: 'custom',
                message: 'end must be after start',
              });
            }
          })
      )
      .query(async ({ input }) => input.end - input.start);

    await expect((fn as any)._handler({}, { start: 1, end: 5 })).resolves.toBe(
      4
    );

    await expect(
      (fn as any)._handler({}, { start: 5, end: 1 })
    ).rejects.toBeTruthy();
  });

  test('chained .input() keeps each schema object-level checks independent', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(
        z
          .strictObject({ start: z.number(), end: z.number() })
          .refine((v) => v.end > v.start, {
            message: 'end must be after start',
          })
      )
      .input(z.object({ label: z.string() }))
      .query(async ({ input }) => `${input.label}:${input.end - input.start}`);

    await expect(
      (fn as any)._handler({}, { start: 1, end: 5, label: 'range' })
    ).resolves.toBe('range:4');

    await expect(
      (fn as any)._handler({}, { start: 5, end: 1, label: 'range' })
    ).rejects.toBeTruthy();
  });

  test('a redeclared key is validated only by the schema that declares it last', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    // `.paginated()` redeclares `limit`, so its `.default(20)` fills the gap
    // rather than the earlier required declaration rejecting the payload.
    const fn = c.query
      .input(z.object({ limit: z.number() }))
      .paginated({ limit: 20, item: z.object({ id: z.string() }) })
      .query(async ({ input }) => ({
        continueCursor: null,
        isDone: true,
        page: [{ id: String(input.limit) }],
      }));

    await expect((fn as any)._handler({}, {})).resolves.toMatchObject({
      page: [{ id: '20' }],
    });

    await expect((fn as any)._handler({}, { limit: 5 })).resolves.toMatchObject(
      { page: [{ id: '5' }] }
    );

    await expect(
      (fn as any)._handler({}, { limit: 999 })
    ).resolves.toMatchObject({ page: [{ id: '20' }] });
  });

  test('a superseded key relaxes its schema once per procedure, not per request', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const userInput = z.object({ limit: z.number() });
    let safeExtendCalls = 0;
    const originalSafeExtend = userInput.safeExtend;
    (userInput as any).safeExtend = (incoming: any) => {
      safeExtendCalls += 1;
      return (originalSafeExtend as any)(incoming);
    };

    const fn = c.query
      .input(userInput)
      .paginated({ limit: 20, item: z.object({ id: z.string() }) })
      .query(async ({ input }) => ({
        continueCursor: null,
        isDone: true,
        page: [{ id: String(input.limit) }],
      }));

    // Relaxing `limit` happens while the procedure is being defined.
    expect(safeExtendCalls).toBe(1);

    await expect((fn as any)._handler({}, { limit: 5 })).resolves.toMatchObject(
      { page: [{ id: '5' }] }
    );
    await expect((fn as any)._handler({}, { limit: 7 })).resolves.toMatchObject(
      { page: [{ id: '7' }] }
    );

    expect(safeExtendCalls).toBe(1);
  });

  test('a shadowed key takes the later declaration type, not the earlier one', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    // `cursor` starts as a required string, then `.paginated()` redeclares it
    // as `string | null` defaulting to null.
    const fn = c.query
      .input(z.object({ cursor: z.string() }))
      .paginated({ limit: 10, item: z.object({ id: z.string() }) })
      .query(async ({ input }) => ({
        continueCursor: null,
        isDone: true,
        page: [{ id: String((input as any).cursor) }],
      }));

    await expect((fn as any)._handler({}, {})).resolves.toMatchObject({
      page: [{ id: 'null' }],
    });

    await expect(
      (fn as any)._handler({}, { cursor: 'c1' })
    ).resolves.toMatchObject({ page: [{ id: 'c1' }] });
  });

  test('a redeclared key keeps the later schema type across plain .input() chaining', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(z.object({ value: z.string(), keep: z.string() }))
      .input(z.object({ value: z.number() }))
      .query(async ({ input }) => `${input.keep}:${input.value * 2}`);

    await expect(
      (fn as any)._handler({}, { value: 21, keep: 'k' })
    ).resolves.toBe('k:42');

    // the surviving declaration still validates
    await expect(
      (fn as any)._handler({}, { value: 'nope', keep: 'k' })
    ).rejects.toBeTruthy();
  });

  test('a redeclared key is not re-validated by an earlier refined schema', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(
        z
          .object({ value: z.string(), label: z.string() })
          .refine((v) => v.label.length > 0, { message: 'label required' })
      )
      .input(z.object({ value: z.number() }))
      .query(async ({ input }) => `${input.label}:${input.value * 2}`);

    await expect(
      (fn as any)._handler({}, { value: 21, label: 'k' })
    ).resolves.toBe('k:42');

    // the earlier schema's object-level rule still runs
    await expect(
      (fn as any)._handler({}, { value: 21, label: '' })
    ).rejects.toBeTruthy();

    // the surviving declaration still validates
    await expect(
      (fn as any)._handler({}, { value: 'nope', label: 'k' })
    ).rejects.toBeTruthy();
  });

  test('an earlier object-level check reads the redeclared value the last schema produced', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(
        z
          .object({ limit: z.number() })
          .refine((v) => v.limit <= 10, { message: 'limit too high' })
      )
      .input(z.object({ limit: z.number().default(5) }))
      .query(async ({ input }) => input.limit);

    // the later default fills the gap and satisfies the earlier rule
    await expect((fn as any)._handler({}, {})).resolves.toBe(5);

    await expect((fn as any)._handler({}, { limit: 50 })).rejects.toBeTruthy();
  });

  test('paginated() composes with an .input() schema carrying object-level checks', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .input(
        z
          .object({ min: z.number(), max: z.number() })
          .refine((v) => v.max >= v.min, { message: 'max must be >= min' })
      )
      .paginated({ limit: 10, item: z.object({ id: z.string() }) })
      .query(async ({ input }) => ({
        continueCursor: null,
        isDone: true,
        page: [{ id: `${input.min}-${input.max}:${input.limit}` }],
      }));

    await expect(
      (fn as any)._handler({}, { min: 1, max: 4, limit: 999 })
    ).resolves.toMatchObject({ page: [{ id: '1-4:10' }] });

    await expect(
      (fn as any)._handler({}, { min: 4, max: 1, limit: 5 })
    ).rejects.toBeTruthy();
  });

  test('input transforms run exactly once', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    let stringTransforms = 0;
    const stringFn = c.query
      .input(
        z.object({
          s: z.string().transform((s) => {
            stringTransforms += 1;
            return s.length;
          }),
        })
      )
      .query(async ({ input }) => input.s);

    await expect((stringFn as any)._handler({}, { s: 'hello' })).resolves.toBe(
      5
    );
    expect(stringTransforms).toBe(1);

    const doubleFn = c.query
      .input(z.object({ n: z.number().transform((n) => n * 2) }))
      .query(async ({ input }) => input.n);

    await expect((doubleFn as any)._handler({}, { n: 3 })).resolves.toBe(6);
  });

  test('input refinements run exactly once', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    let refinements = 0;
    const fn = c.query
      .input(
        z.object({
          email: z.string().refine((value) => {
            refinements += 1;
            return value.includes('@');
          }),
        })
      )
      .query(async ({ input }) => input.email);

    await expect((fn as any)._handler({}, { email: 'a@b.com' })).resolves.toBe(
      'a@b.com'
    );
    expect(refinements).toBe(1);
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

  test('query.output() strips undeclared keys', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .output(z.object({ id: z.string() }))
      .query(async () => ({ id: 'a', secret: 'hidden' }) as any);

    await expect((fn as any)._handler({}, {})).resolves.toEqual({ id: 'a' });
  });

  test('query.output() enforces refinements the Convex validator loses', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    // zodOutputToConvex flattens this to v.float64(), so only the Zod parse
    // can reject it.
    const fn = c.query
      .output(z.object({ n: z.number().min(3) }))
      .query(async () => ({ n: 1 }));

    await expect((fn as any)._handler({}, {})).rejects.toBeTruthy();
  });

  test('query.output() runs before wire encoding', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const iso = '2023-11-14T22:13:20.000Z';
    const fn = c.query
      .output(z.object({ at: z.string().transform((s) => new Date(s)) }))
      .query(async () => ({ at: iso }));

    // The transform produces a Date, so the transformer must still get a
    // chance to encode it.
    await expect((fn as any)._handler({}, {})).resolves.toEqual(
      encodeWire({ at: new Date(iso) })
    );
  });

  test('query.output() validates undefined before wire normalization', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .output(z.string().default('fallback'))
      .query(async () => undefined);

    await expect((fn as any)._handler({}, {})).resolves.toBe('fallback');
  });

  test('query.output() parses the handler value without coercing undefined', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    // `.output()` parses exactly what the handler returned, so a nullable schema
    // rejects `undefined` - the handler owes it an explicit `null`. The low-level
    // `returns:` option coerces instead; the two paths are not interchangeable.
    const implicit = c.query
      .output(z.string().nullable())
      .query(async () => undefined as any);

    await expect((implicit as any)._handler({}, {})).rejects.toBeInstanceOf(
      CRPCError
    );

    const explicit = c.query
      .output(z.string().nullable())
      .query(async () => null);

    await expect((explicit as any)._handler({}, {})).resolves.toBeNull();
  });

  test('output() models an absent value as null, which the Convex validator can express', () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const nullable: any = c.query
      .output(z.string().nullable())
      .query(async () => null);

    expect(nullable.exportReturns()).toBe(
      JSON.stringify({
        type: 'union',
        value: [{ type: 'string' }, { type: 'null' }],
      })
    );

    // A top-level optional is why `.nullable()` is the documented shape: Convex
    // serializes an `undefined` return as `null`, and its returns validator
    // drops top-level optionality, so the published validator would reject that
    // `null` on every call. Inside an object the optionality survives.
    const optional: any = c.query
      .output(z.string().optional())
      .query(async () => undefined);

    expect(optional.exportReturns()).toBe(JSON.stringify({ type: 'string' }));

    const nested: any = c.query
      .output(z.object({ name: z.string().optional() }))
      .query(async () => ({}));

    expect(nested.exportReturns()).toBe(
      JSON.stringify({
        type: 'object',
        value: { name: { fieldType: { type: 'string' }, optional: true } },
      })
    );
  });

  test('query.output() failures surface as a CRPCError carrying the Zod issues', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .output(z.object({ ok: z.boolean() }))
      .query(async () => ({ ok: 'nope' }) as any);

    // A bare ZodError carries no ConvexError marker, so Convex would redact it to
    // an opaque `Server Error`. Wrapping keeps the mismatch self-diagnosing, the
    // way `.input()` failures already are.
    const error = await (fn as any)._handler({}, {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CRPCError);
    expect((error as CRPCError).code).toBe('INTERNAL_SERVER_ERROR');
    expect((error as any).data.ZodError).toEqual([
      {
        expected: 'boolean',
        code: 'invalid_type',
        path: ['ok'],
      },
    ]);
  });

  test('output validation sanitizes custom issues before exposing client data', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);
    const secret = 'server-only-output';
    const schema = z.string().superRefine((value, ctx) => {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Rejected ${value}`,
        rejectedValue: value,
      } as any);
    });
    const fn = c.query.output(schema).query(async () => secret);

    const error = await (fn as any)._handler({}, {}).catch((e: unknown) => e);

    expect((error as any).data.ZodError).toEqual([
      { code: 'custom', path: ['<dynamic>'] },
    ]);
    expect(JSON.stringify((error as any).data)).not.toContain(secret);
    expect((error as any).cause.issues[0].message).toContain(secret);
  });

  test('output validation redacts runtime record keys from issue paths', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);
    const secretKey = 'server-only-record-key';
    const fn = c.query
      .output(z.record(z.string(), z.boolean()))
      .query(async () => ({ [secretKey]: 'nope' }) as any);

    const error = await (fn as any)._handler({}, {}).catch((e: unknown) => e);

    expect((error as any).data.ZodError).toEqual([
      {
        code: 'invalid_type',
        expected: 'boolean',
        path: ['<dynamic>'],
      },
    ]);
    expect(JSON.stringify((error as any).data)).not.toContain(secretKey);
    expect((error as any).cause.issues[0].path).toEqual([secretKey]);
  });

  test('output validation keeps declared fields while redacting dynamic containers', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);
    const secretKey = 'nested-server-only-key';
    const fn = c.query
      .output(
        z.object({
          items: z.array(z.record(z.string(), z.boolean())),
        })
      )
      .query(async () => ({ items: [{ [secretKey]: 'nope' }] }) as any);

    const error = await (fn as any)._handler({}, {}).catch((e: unknown) => e);

    expect((error as any).data.ZodError).toEqual([
      {
        code: 'invalid_type',
        expected: 'boolean',
        path: ['items', '<dynamic>', '<dynamic>'],
      },
    ]);
    expect(JSON.stringify((error as any).data)).not.toContain(secretKey);
    expect((error as any).cause.issues[0].path).toEqual([
      'items',
      0,
      secretKey,
    ]);
  });

  test('output() failures on an int64 schema still report the mismatch', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    // A bound on a bigint puts one in the issue, and `JSON.stringify` throws on
    // those - which would replace the mismatch with a serialization failure.
    const fn = c.query.output(z.bigint().min(5n)).query(async () => 1n);

    const error = await (fn as any)._handler({}, {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CRPCError);
    expect((error as any).data.ZodError[0]).toEqual({
      code: 'too_small',
      path: [],
    });
  });

  test('paginated() output failures surface as a CRPCError', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .paginated({ limit: 10, item: z.object({ id: z.string() }) })
      .query(async () => ({ isDone: true, page: [{ id: 1 }] }) as any);

    await expect(
      (fn as any)._handler({}, { cursor: null, limit: 10 })
    ).rejects.toBeInstanceOf(CRPCError);
  });

  test('paginated() preserves Convex page split metadata', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .paginated({ limit: 10, item: z.object({ id: z.string() }) })
      .query(async () => ({
        continueCursor: 'page-end',
        isDone: false,
        page: [{ id: 'one' }],
        pageStatus: 'SplitRequired' as const,
        splitCursor: 'page-midpoint',
      }));

    await expect((fn as any)._handler({}, {})).resolves.toEqual({
      continueCursor: 'page-end',
      isDone: false,
      page: [{ id: 'one' }],
      pageStatus: 'SplitRequired',
      splitCursor: 'page-midpoint',
    });
  });

  test('paginated() passes an optional end cursor to the handler', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const fn = c.query
      .paginated({ limit: 10, item: z.object({ id: z.string() }) })
      .query(async ({ input }) => ({
        continueCursor: 'page-end',
        isDone: true,
        page: [{ id: String((input as any).endCursor) }],
      }));

    await expect(
      (fn as any)._handler({}, { endCursor: 'page-boundary' })
    ).resolves.toMatchObject({ page: [{ id: 'page-boundary' }] });
  });

  test('output validation does not swallow a ZodError thrown by the handler', async () => {
    const c = initCRPC.create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

    const cause = new z.ZodError([]);
    const fn = c.query.output(z.string()).query(async () => {
      throw cause;
    });

    await expect((fn as any)._handler({}, {})).rejects.toBe(cause);
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
