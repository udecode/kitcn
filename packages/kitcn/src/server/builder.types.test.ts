import { mutationGeneric, queryGeneric } from 'convex/server';
import { expectTypeOf, test } from 'vitest';
import { initCRPC } from './builder';

type QueryCtx = {
  db: {
    get: (id: string) => Promise<string | null>;
  };
};

type MutationCtx = QueryCtx & {
  db: QueryCtx['db'] & {
    insert: (table: string, value: unknown) => Promise<string>;
  };
};

test('shared middleware preserves mutation-specific ctx members', () => {
  const c = initCRPC
    .context({
      query: (ctx: QueryCtx) => ctx,
      mutation: (ctx: MutationCtx) => ctx,
    })
    .create({
      query: queryGeneric,
      mutation: mutationGeneric,
    } as any);

  const authMiddleware = c.middleware(async ({ ctx, next }) =>
    next({
      ctx: {
        ...ctx,
        user: { id: 'user_1' as string },
      },
    })
  );

  c.mutation.use(authMiddleware).mutation(async ({ ctx }) => {
    expectTypeOf(ctx.user.id).toEqualTypeOf<string>();
    expectTypeOf(ctx.db.insert).toEqualTypeOf<
      (table: string, value: unknown) => Promise<string>
    >();
    return 'ok';
  });

  c.query.use(authMiddleware).query(async ({ ctx }) => {
    // @ts-expect-error query db stays read-only after shared middleware
    ctx.db.insert('messages', {});
    return ctx.user.id;
  });
});

test('shared middleware preserves mutation db writer on default convex ctx', () => {
  const c = initCRPC.create({
    query: queryGeneric,
    mutation: mutationGeneric,
  } as any);

  const authMiddleware = c.middleware(async ({ ctx, next }) =>
    next({
      ctx: {
        ...ctx,
        user: { id: 'user_1' as string },
        userId: 'user_1' as string,
      },
    })
  );

  c.mutation.use(authMiddleware).mutation(async ({ ctx }) => {
    expectTypeOf(ctx.user.id).toEqualTypeOf<string>();
    expectTypeOf(ctx.userId).toEqualTypeOf<string>();
    expectTypeOf(ctx.db.insert).toBeFunction();
    return null;
  });
});
