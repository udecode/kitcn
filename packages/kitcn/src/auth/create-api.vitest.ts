import {
  defineSchema,
  defineTable,
  makeFunctionReference,
} from 'convex/server';
import { v } from 'convex/values';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { createApi } from './create-api';

const schema = defineSchema({
  user: defineTable({
    email: v.string(),
    name: v.string(),
  }),
});

const authApi = createApi(schema, (() => ({})) as any, {
  getBetterAuthSchema: () =>
    ({
      user: { fields: { email: {}, name: {} }, modelName: 'user' },
    }) as any,
});

const modules = {
  './_generated/api.js': async () => ({}),
  './auth.js': async () => authApi,
};

describe('auth/create-api findMany', () => {
  test('accepts select and returns only the selected fields', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('user', { email: 'a@example.com', name: 'Ada' });
    });

    const result = await t.query(
      makeFunctionReference<'query'>('auth:findMany'),
      {
        model: 'user',
        paginationOpts: { cursor: null, numItems: 10 },
        select: ['email'],
      }
    );

    expect(result.page).toEqual([{ email: 'a@example.com' }]);
  });
});
