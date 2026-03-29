import { eq } from 'kitcn/orm';
import { z } from 'zod';
import {
  authMutation,
  authQuery,
  optionalAuthQuery,
  publicQuery,
} from '../lib/crpc';
import { userTable } from './schema';

/** Get session user - used by AuthSync and authAction */
export const getSessionUser = optionalAuthQuery
  .output(
    z.union([
      z.object({
        id: z.string(),
        activeOrganization: z
          .object({
            id: z.string(),
            logo: z.string().nullish(),
            name: z.string(),
            role: z.string(),
            slug: z.string(),
          })
          .nullable(),
        image: z.string().nullish(),
        isAdmin: z.boolean(),
        name: z.string().optional(),
        personalOrganizationId: z.string().nullish(),
        plan: z.string().optional(),
      }),
      z.null(),
    ])
  )
  .query(async ({ ctx }) => {
    const { user } = ctx;
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      activeOrganization: user.activeOrganization ?? null,
      image: user.image,
      isAdmin: user.isAdmin ?? false,
      name: user.name,
      personalOrganizationId: user.personalOrganizationId,
      plan: user.plan,
    };
  });

/** Check if user is authenticated */
export const getIsAuthenticated = publicQuery
  .output(z.boolean())
  .query(async ({ ctx }) => !!(await ctx.auth.getUserIdentity()));

/** Get full user data for the authenticated user */
export const getCurrentUser = authQuery
  .output(
    z.union([
      z.object({
        id: z.string(),
        activeOrganization: z
          .object({
            id: z.string(),
            logo: z.string().nullish(),
            name: z.string(),
            role: z.string(),
            slug: z.string(),
          })
          .nullable(),
        image: z.string().nullish(),
        isAdmin: z.boolean(),
        name: z.string().optional(),
        personalOrganizationId: z.string().nullish(),
        plan: z.string().optional(),
      }),
      z.null(),
    ])
  )
  .query(async ({ ctx }) => {
    const { user } = ctx;

    return {
      id: user.id,
      activeOrganization: user.activeOrganization ?? null,
      image: user.image,
      isAdmin: user.isAdmin ?? false,
      name: user.name,
      personalOrganizationId: user.personalOrganizationId,
      plan: user.plan,
    };
  });

/** Update user settings */
export const updateSettings = authMutation
  .input(
    z.object({
      bio: z.string().optional(),
      name: z.string().optional(),
    })
  )
  .output(z.object({ success: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    const { userId } = ctx;
    const { bio, name } = input;

    await ctx.orm
      .update(userTable)
      .set({ bio, name })
      .where(eq(userTable.id, userId));

    return { success: true };
  });
