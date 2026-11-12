import type {
  DataModelFromSchemaDefinition,
  MutationBuilder,
  QueryBuilder,
} from 'convex/server';
import {
  defineSchema,
  defineTable,
  mutationGeneric,
  queryGeneric,
} from 'convex/server';
import { CommitTsPlaceholder, v } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { customCtx } from './customFunctions';
import {
  convexToZod,
  zCustomMutation,
  zCustomQuery,
  zid,
  zodOutputToConvex,
  zodToConvex,
} from './zod4';

const schema = defineSchema({
  users: defineTable({
    name: v.string(),
  }),
});
type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query = queryGeneric as QueryBuilder<DataModel, 'public'>;
const mutation = mutationGeneric as MutationBuilder<DataModel, 'public'>;

describe('zod4 (vendored)', () => {
  test('convexToZod supports commit timestamp values and placeholders', () => {
    const validator = convexToZod(v.commitTs());

    expect(validator.safeParse(42n).success).toBe(true);
    expect(validator.safeParse(new CommitTsPlaceholder()).success).toBe(true);
    expect(validator.safeParse(42).success).toBe(false);
  });

  test('convexToZod supports function handle validators', () => {
    const validator = convexToZod(v.function({ fnType: 'query' }));

    expect(validator.safeParse('function://handle').success).toBe(true);
    expect(validator.safeParse('').success).toBe(false);
    expect(validator.safeParse('not-a-handle').success).toBe(false);
    expect(validator.safeParse(42).success).toBe(false);
  });

  test('zid converts to a table-scoped Convex id validator', () => {
    const validator = zodToConvex(
      z.object({
        userId: zid('users'),
      })
    ) as any;

    expect(validator.kind).toBe('object');
    expect(validator.fields.userId.kind).toBe('id');
    expect(validator.fields.userId.tableName).toBe('users');
  });

  test('zodToConvex vs zodOutputToConvex follow transform input/output semantics', () => {
    const transformed = z.object({
      value: z.string().transform((value) => value.length),
    });

    const inputValidator = zodToConvex(transformed) as any;
    const outputValidator = zodOutputToConvex(transformed) as any;

    expect(inputValidator.fields.value.kind).toBe('string');
    expect(outputValidator.fields.value.kind).toBe('any');
  });

  test('zCustom builders apply custom context and validate I/O', async () => {
    const zQuery = zCustomQuery(
      query,
      customCtx(async () => ({
        role: 'reader',
      }))
    );
    const queryFn = zQuery({
      args: { name: z.string() },
      handler: async (ctx, args) => ({
        upper: args.name.toUpperCase(),
        role: (ctx as { role: string }).role,
      }),
      returns: z.object({
        upper: z.string(),
        role: z.string(),
      }),
    });

    await expect(
      (queryFn as any)._handler({}, { name: 'ada' })
    ).resolves.toEqual({
      upper: 'ADA',
      role: 'reader',
    });

    await expect(
      (queryFn as any)._handler({}, { name: 123 })
    ).rejects.toThrow();

    // `returns` still declares the Convex validator the backend enforces.
    expect(JSON.parse((queryFn as any).exportReturns())).toMatchObject({
      type: 'object',
    });

    const zMutation = zCustomMutation(
      mutation,
      customCtx(async () => ({
        role: 'writer',
      }))
    );
    const mutationFn = zMutation({
      args: { count: z.number() },
      handler: async (ctx, args) => ({
        doubled: args.count * 2,
        role: (ctx as { role: string }).role,
      }),
      returns: z.object({
        doubled: z.number(),
        role: z.string(),
      }),
    });

    await expect(
      (mutationFn as any)._handler({}, { count: 5 })
    ).resolves.toEqual({
      doubled: 10,
      role: 'writer',
    });
  });

  test('returns runs before the Convex validator it declares', async () => {
    const zQuery = zCustomQuery(
      query,
      customCtx(async () => ({}))
    );
    const queryFn = zQuery({
      args: { id: z.string() },
      // The handler is typed as the schema's input, and Convex validates its
      // output, so the parse has to bridge the two.
      returns: z.object({
        count: z.string().transform((value) => Number(value)),
        label: z.string().default('anon'),
      }),
      handler: async () => ({ count: '5' }),
    });

    await expect((queryFn as any)._handler({}, { id: 'a' })).resolves.toEqual({
      count: 5,
      label: 'anon',
    });
  });

  test('returns rejects a value the schema does not accept', async () => {
    const zQuery = zCustomQuery(
      query,
      customCtx(async () => ({}))
    );
    const queryFn = zQuery({
      args: { id: z.string() },
      returns: z.object({ name: z.string() }),
      handler: async () => ({ name: 123 }) as any,
    });

    await expect((queryFn as any)._handler({}, { id: 'a' })).rejects.toThrow();
  });

  test('skipZodReturnsValidation declares the validator without parsing', async () => {
    const zQuery = zCustomQuery(
      query,
      customCtx(async () => ({}))
    );
    const queryFn = zQuery({
      args: { id: z.string() },
      returns: z.object({ name: z.string().toUpperCase() }),
      skipZodReturnsValidation: true,
      handler: async () => ({ name: 'ada' }),
    });

    // Untouched by Zod, and still declared for the Convex backend to enforce.
    await expect((queryFn as any)._handler({}, { id: 'a' })).resolves.toEqual({
      name: 'ada',
    });
    expect(JSON.parse((queryFn as any).exportReturns())).toMatchObject({
      type: 'object',
    });
  });

  test('the args schema is built once per procedure, not once per request', async () => {
    let shapeReads = 0;
    const shape = new Proxy(
      { name: z.string() },
      {
        get(target, key, receiver) {
          shapeReads += 1;
          return Reflect.get(target, key, receiver);
        },
      }
    );

    const zQuery = zCustomQuery(
      query,
      customCtx(async () => ({}))
    );
    const queryFn = zQuery({
      args: shape as any,
      handler: async (_ctx, args) => (args as { name: string }).name,
    });

    // Undeclared keys are still dropped before the handler sees them.
    await expect(
      (queryFn as any)._handler({}, { name: 'ada', extra: 'dropped' })
    ).resolves.toBe('ada');

    const afterFirstCall = shapeReads;

    await expect((queryFn as any)._handler({}, { name: 'bob' })).resolves.toBe(
      'bob'
    );

    // A fresh z.object(shape) per request would re-read the shape here.
    expect(shapeReads).toBe(afterFirstCall);
  });
});
