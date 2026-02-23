import { z } from 'zod';
import { privateAction, privateMutation } from '../lib/crpc';
import type { TableNames } from './_generated/dataModel';
import { createResetCaller } from './generated/reset.runtime';
import schema, { tables } from './schema';

// Clear all of the tables except...
const excludedTables = new Set<TableNames>();

export const reset = privateAction
  .meta({ dev: true })
  .action(async ({ ctx }) => {
    const caller = createResetCaller(ctx);
    // Delete all Polar customers first (comprehensive cleanup)
    // await deletePolarCustomers();

    for (const tableName of Object.keys(schema.tables)) {
      if (excludedTables.has(tableName as TableNames)) {
        continue;
      }

      await caller.schedule.now.deleteTable({
        cursor: null,
        tableName,
      });
    }
  });

export const deleteTable = privateMutation
  .meta({ dev: true })
  .input(
    z.object({
      cursor: z.union([z.string(), z.null()]),
      tableName: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // biome-ignore lint/suspicious/noExplicitAny: generic
    const table = (tables as Record<string, any>)[input.tableName];

    // full-table reset is intentional; strict mode requires explicit opt-in
    await ctx.orm.delete(table).allowFullScan();
  });
