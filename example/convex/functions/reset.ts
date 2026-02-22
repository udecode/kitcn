/** biome-ignore-all lint/suspicious/noExplicitAny: dev */
import { eq } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import { z } from 'zod';
import { privateAction, privateMutation, privateQuery } from '../lib/crpc';
import { getEnv } from '../lib/get-env';
import { deletePolarCustomers } from '../lib/polar-helpers';
import { internal } from './_generated/api';
import type { TableNames } from './_generated/dataModel';
import schema, { tables } from './schema';

const DELETE_BATCH_SIZE = 64;

// Clear all of the tables except...
const excludedTables = new Set<TableNames>();

/** Dev-only check helper */
const assertDevOnly = () => {
  if (getEnv().DEPLOY_ENV === 'production') {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: 'This function is only available in development',
    });
  }
};

export const reset = privateAction.output(z.null()).action(async ({ ctx }) => {
  assertDevOnly();
  const tableNames = Object.keys(schema.tables);
  console.log('Reset started', {
    excludedTables: Array.from(excludedTables),
    totalTables: tableNames.length,
  });

  // Delete all Polar customers first (comprehensive cleanup)
  await deletePolarCustomers();

  for (const tableName of tableNames) {
    if (excludedTables.has(tableName as TableNames)) {
      console.log('Skipping excluded table', { tableName });
      continue;
    }

    console.log('Scheduling first delete page', { tableName });
    await ctx.scheduler.runAfter(0, internal.reset.deletePage, {
      cursor: null,
      tableName,
    });
  }

  return null;
});

export const deletePage = privateMutation
  .input(
    z.object({
      cursor: z.union([z.string(), z.null()]),
      tableName: z.string(),
    })
  )
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    assertDevOnly();
    console.log('Running delete page', {
      cursor: input.cursor,
      tableName: input.tableName,
    });

    const table = (tables as Record<string, any>)[input.tableName];
    if (!table) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: `Unknown table: ${input.tableName}`,
      });
    }

    const query = (ctx.orm.query as Record<string, any>)[input.tableName];
    if (!query || typeof query.findMany !== 'function') {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: `Unknown query table: ${input.tableName}`,
      });
    }

    const results = await query.findMany({
      cursor: input.cursor,
      limit: DELETE_BATCH_SIZE,
    });

    let deletedCount = 0;
    let failedCount = 0;

    for (const row of results.page) {
      try {
        await ctx.orm.delete(table).where(eq(table.id, (row as any).id));
        deletedCount++;
      } catch (error) {
        failedCount++;
        console.error('Failed to delete row during reset', {
          error: error instanceof Error ? error.message : String(error),
          rowId: (row as any).id,
          tableName: input.tableName,
        });
        // Document might have been deleted by a trigger or concurrent process
      }
    }

    console.log('Delete page complete', {
      deletedCount,
      failedCount,
      hasMore: !results.isDone,
      pageSize: results.page.length,
      tableName: input.tableName,
    });

    if (!results.isDone) {
      console.log('Scheduling next delete page', {
        nextCursor: results.continueCursor,
        tableName: input.tableName,
      });
      await ctx.scheduler.runAfter(0, internal.reset.deletePage, {
        cursor: results.continueCursor,
        tableName: input.tableName,
      });
    }

    return null;
  });

export const getAdminUsers = privateQuery
  .output(
    z.array(
      z.object({
        customerId: z.string().optional().nullable(),
      })
    )
  )
  .query(async ({ ctx }) => {
    assertDevOnly();
    const adminEmails = getEnv().ADMIN;
    if (!adminEmails.length) return [];

    const admins = await ctx.orm.query.user.findMany({
      where: { email: { in: adminEmails } },
      limit: adminEmails.length,
      columns: { customerId: true },
    });

    return admins
      .filter((u): u is typeof u & { customerId: string } => !!u.customerId)
      .map((u) => ({ customerId: u.customerId }));
  });
