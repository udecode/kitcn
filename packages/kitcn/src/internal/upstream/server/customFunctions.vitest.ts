import type { MutationBuilder } from 'convex/server';
import { mutationGeneric } from 'convex/server';
import { v } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { customCtx, customMutation } from './customFunctions';

const mutation = mutationGeneric as MutationBuilder<any, 'public'>;

describe('customFunctions (vendored)', () => {
  test('customCtx applies ctx transforms before handler', async () => {
    const wrappedMutation = customMutation(
      mutation,
      customCtx(async (ctx) => ({
        ...ctx,
        source: 'customCtx',
      }))
    );
    const fn = wrappedMutation({
      args: { value: v.number() },
      handler: async (ctx, args) => ({
        source: (ctx as { source: string }).source,
        value: args.value,
      }),
    });

    await expect((fn as any)._handler({}, { value: 42 })).resolves.toEqual({
      source: 'customCtx',
      value: 42,
    });
  });

  test('customMutation consumes custom args and forwards handler args', async () => {
    const withApiKey = customMutation(mutation, {
      args: { apiKey: v.string() },
      input: async (_ctx, args) => {
        if (args.apiKey !== 'secret') {
          throw new Error('Invalid API key');
        }
        return { ctx: { authorized: true }, args: {} };
      },
    });

    const fn = withApiKey({
      args: { value: v.number() },
      handler: async (ctx, args) => ({
        authorized: (ctx as { authorized: boolean }).authorized,
        value: args.value,
      }),
    });

    await expect(
      (fn as any)._handler({}, { apiKey: 'secret', value: 7 })
    ).resolves.toEqual({
      authorized: true,
      value: 7,
    });

    await expect(
      (fn as any)._handler({}, { apiKey: 'bad-key', value: 7 })
    ).rejects.toThrow('Invalid API key');
  });
});
