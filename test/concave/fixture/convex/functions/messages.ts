import { z } from 'zod';
import { publicMutation, publicQuery } from '../lib/crpc';

export const create = publicMutation
  .input(
    z.object({
      body: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    return await ctx.db.insert('messages', {
      body: input.body,
    });
  });

export const list = publicQuery.query(async ({ ctx }) => {
  return await ctx.db.query('messages').collect();
});
