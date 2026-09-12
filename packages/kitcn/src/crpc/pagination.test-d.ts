import { queryGeneric } from 'convex/server';
import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { initCRPC } from '../server/builder';
import type { InfiniteQueryInput } from './types';

test('infinite query input hides transport-owned pagination fields', () => {
  expectTypeOf<
    InfiniteQueryInput<{
      cursor: string | null;
      endCursor?: string | null;
      limit?: number;
      tag: string;
    }>
  >().toEqualTypeOf<{ tag: string }>();

  const userInput: InfiniteQueryInput<{
    cursor: string | null;
    endCursor?: string | null;
    limit?: number;
    tag: string;
  }> = {
    // @ts-expect-error endCursor is controlled by the infinite-query hook
    endCursor: 'internal-boundary',
    tag: 'x',
  };
  expectTypeOf(userInput).toEqualTypeOf<{ tag: string }>();
});

test('paginated handlers receive the optional page boundary', () => {
  const c = initCRPC.create({ query: queryGeneric } as any);

  c.query
    .paginated({ limit: 20, item: z.object({ id: z.string() }) })
    .query(async ({ input }) => {
      expectTypeOf(input.cursor).toEqualTypeOf<string | null>();
      expectTypeOf(input.endCursor).toEqualTypeOf<string | null | undefined>();
      expectTypeOf(input.limit).toEqualTypeOf<number>();

      return {
        continueCursor: 'page-end',
        isDone: false,
        page: [{ id: 'one' }],
        pageStatus: 'SplitRecommended' as const,
        splitCursor: 'page-middle',
      };
    });
});
