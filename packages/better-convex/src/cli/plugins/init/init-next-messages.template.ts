export const INIT_NEXT_MESSAGES_TEMPLATE = `import { z } from 'zod';

import { publicMutation, publicQuery } from '../lib/crpc';

export const list = publicQuery
  .output(
    z.array(
      z.object({
        id: z.string(),
        body: z.string(),
        createdAt: z.date(),
      })
    )
  )
  .query(async ({ ctx }) => {
    const rows = await ctx.db.query('messages').order('desc').take(10);

    return rows.map((row) => ({
      id: row._id,
      body: row.body,
      createdAt: new Date(row._creationTime),
    }));
  });

export const create = publicMutation
  .input(
    z.object({
      body: z.string().trim().min(1).max(120),
    })
  )
  .output(z.string())
  .mutation(async ({ ctx, input }) =>
    await ctx.db.insert('messages', { body: input.body })
  );
`;
