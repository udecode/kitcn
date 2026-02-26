import { eq } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import { z } from 'zod';

import { authMutation, authQuery } from '../lib/crpc';
import { userTable } from './schema';

// Admin operations that work with our application's user role system
// Better Auth's admin plugin handles banning, sessions, etc. through the client

// Check if a user has admin privileges in our system
export const checkUserAdminStatus = authQuery
  .meta({ role: 'admin' })
  .input(z.object({ userId: z.string() }))
  .output(
    z.object({
      isAdmin: z.boolean(),
      role: z.string().nullish(),
    })
  )
  .query(async ({ ctx, input }) => {
    const userId = input.userId;
    const user = await ctx.orm.query.user.findFirstOrThrow({
      where: { id: userId },
    });

    return {
      isAdmin: user.role === 'admin',
      role: user.role,
    };
  });

// Update user role
export const updateUserRole = authMutation
  .meta({ role: 'admin' })
  .input(
    z.object({
      role: z.enum(['user', 'admin']),
      userId: z.string(),
    })
  )
  .output(z.boolean())
  .mutation(async ({ ctx, input }) => {
    const userId = input.userId;
    // Only admin can promote to admin
    if (input.role === 'admin' && !ctx.user.isAdmin) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only admin can promote users to admin',
      });
    }

    const targetUser = await ctx.orm.query.user.findFirstOrThrow({
      where: { id: userId },
    });

    // Can't demote admin unless you are admin
    if (targetUser.role === 'admin' && !ctx.user.isAdmin) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Cannot modify admin users',
      });
    }

    await ctx.orm
      .update(userTable)
      .set({ role: input.role.toLowerCase() })
      .where(eq(userTable.id, targetUser.id));

    return true;
  });

// Grant admin access to a user based on their email (for admin setup)
export const grantAdminByEmail = authMutation
  .meta({ role: 'admin' })
  .input(
    z.object({
      email: z.string().email(),
      role: z.enum(['admin']),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      userId: z.string().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({
      where: { email: input.email },
    });

    if (!user) {
      return {
        success: false,
      };
    }

    await ctx.orm
      .update(userTable)
      .set({ role: input.role.toLowerCase() })
      .where(eq(userTable.id, user.id));

    return {
      success: true,
      userId: user.id,
    };
  });

// Schema for user list items
const UserListItemSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  name: z.string().optional(),
  email: z.string(),
  image: z.string().nullish(),
  role: z.string(),
  isBanned: z.boolean().nullish(),
  banReason: z.string().nullish(),
  banExpiresAt: z.date().nullish(),
});
type UserListItem = z.infer<typeof UserListItemSchema>;

// Get all users with pagination for admin dashboard
export const getAllUsers = authQuery
  .input(
    z.object({
      role: z.enum(['all', 'user', 'admin']).optional(),
      search: z.string().optional(),
    })
  )
  .paginated({ limit: 20, item: UserListItemSchema.nullable() })
  .query(async ({ ctx, input }) => {
    const query = ctx.orm.query.user;

    // Filter by search term if provided
    if (input.search) {
      const searchLower = input.search.toLowerCase();

      // For now, just paginate and filter in memory
      // You can add a search index later for better performance
      const result = await query.findMany({
        cursor: input.cursor,
        limit: input.limit,
      });

      const enrichedPage = result.page
        .map((user): UserListItem | null => {
          const email = user?.email || '';

          // Check if any field matches search
          if (
            !(
              user.name?.toLowerCase().includes(searchLower) ||
              email.toLowerCase().includes(searchLower)
            )
          ) {
            return null;
          }

          return {
            ...user,
            banExpiresAt: user?.banExpires,
            banReason: user?.banReason,
            email,
            isBanned: user?.banned,
            role: user?.role || 'user',
          };
        })
        .filter((row): row is UserListItem => row !== null);

      return {
        ...result,
        page: enrichedPage,
      };
    }

    // Regular pagination without search
    const result = await query.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });

    const enrichedPage = result.page
      .map((user): UserListItem | null => {
        const userData: UserListItem = {
          ...user,
          banExpiresAt: user?.banExpires,
          banReason: user?.banReason,
          email: user?.email || '',
          isBanned: user?.banned,
          role: user?.role || 'user',
        };

        // Filter by role if specified
        if (
          input.role &&
          input.role !== 'all' &&
          userData.role !== input.role
        ) {
          return null;
        }

        return userData;
      })
      .filter((row): row is UserListItem => row !== null);

    return {
      ...result,
      page: enrichedPage,
    };
  });

// Get admin dashboard statistics
export const getDashboardStats = authQuery
  .meta({ role: 'admin' })
  .output(
    z.object({
      recentUsers: z.array(
        z.object({
          id: z.string(),
          createdAt: z.date(),
          image: z.string().nullish(),
          name: z.string().optional(),
        })
      ),
      totalAdmins: z.number(),
      totalUsers: z.number(),
      userGrowth: z.array(
        z.object({
          count: z.number(),
          date: z.string(),
        })
      ),
    })
  )
  .query(async ({ ctx }) => {
    const toRows = <TRow>(result: TRow[] | { page: TRow[] }): TRow[] =>
      Array.isArray(result) ? result : result.page;

    // Get recent users
    const recentUsersResult = await ctx.orm.query.user.findMany({
      limit: 5,
      orderBy: { createdAt: 'desc' },
      columns: {
        id: true,
        createdAt: true,
        image: true,
        name: true,
      },
    });
    const recentUsers = toRows(recentUsersResult);

    // Get users from last 7 days for growth calculation
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const usersLast7DaysResult = await ctx.orm.query.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      limit: 1000,
    });
    const usersLast7Days = toRows(usersLast7DaysResult);

    // Calculate user growth for last 7 days
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const userGrowth: { count: number; date: string }[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - i * oneDay);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0)).getTime();
      const endOfDay = new Date(date.setHours(23, 59, 59, 999)).getTime();

      const count = usersLast7Days.filter(
        (user) =>
          user.createdAt.getTime() >= startOfDay &&
          user.createdAt.getTime() <= endOfDay
      ).length;

      userGrowth.push({
        count,
        date: new Date(startOfDay).toISOString().split('T')[0],
      });
    }

    const [totalUsers, totalAdmins] = await Promise.all([
      ctx.orm.query.user.count(),
      ctx.orm.query.user.count({
        where: { role: 'admin' },
      }),
    ]);

    return {
      recentUsers,
      totalAdmins,
      totalUsers,
      userGrowth,
    };
  });
