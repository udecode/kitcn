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
import { v } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { customCtx } from './customFunctions';
import {
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
});
