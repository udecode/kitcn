import '../lib/polar-polyfills';

import { eq } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import { z } from 'zod';
import { privateAction, privateMutation } from '../lib/crpc';
import { getPolarClient } from '../lib/polar-client';
import { userTable } from './schema';

// Create Polar customer (called from user.onCreate trigger)
export const createCustomer = privateAction
  .input(
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
      userId: z.string(),
    })
  )

  .action(async ({ input: args }) => {
    const polar = getPolarClient();

    try {
      await polar.customers.create({
        email: args.email,
        externalId: args.userId,
        name: args.name,
      });
    } catch (error) {
      // Don't fail signup if Polar customer creation fails
      console.error('Failed to create Polar customer:', error);
    }
  });

// Link Polar customer ID to user (called from webhook)
export const updateUserPolarCustomerId = privateMutation
  .input(
    z.object({
      customerId: z.string(),
      userId: z.string(),
    })
  )

  .mutation(async ({ ctx, input: args }) => {
    const user = await ctx.orm.query.user.findFirstOrThrow({
      where: { id: args.userId },
    });

    // Check for duplicate customer IDs
    const existingUser = await ctx.orm.query.user.findFirst({
      where: { customerId: args.customerId },
    });

    if (existingUser && existingUser.id !== args.userId) {
      throw new CRPCError({
        code: 'CONFLICT',
        message: `Another user already has Polar customer ID ${args.customerId}`,
      });
    }

    await ctx.orm
      .update(userTable)
      .set({ customerId: args.customerId })
      .where(eq(userTable.id, user.id));
  });
