import { eq } from 'better-convex/orm';
import { z } from 'zod';
import { privateMutation, privateQuery } from '../lib/crpc';
import { userTable } from './schema';

export const getSessionByToken = privateQuery
  .input(
    z.object({
      token: z.string().min(1),
    })
  )
  .query(async ({ ctx, input }) => {
    const session = await ctx.orm.query.session.findFirst({
      where: { token: input.token },
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
    };
  });

export const getUserById = privateQuery
  .input(
    z.object({
      id: z.string().min(1),
    })
  )
  .query(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({
      where: { id: input.id },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isAnonymous: user.isAnonymous === true,
      bio: user.bio ?? null,
    };
  });

export const setUserBio = privateMutation
  .input(
    z.object({
      id: z.string().min(1),
      bio: z.string().min(1),
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.orm
      .update(userTable)
      .set({ bio: input.bio })
      .where(eq(userTable.id, input.id));

    return null;
  });
