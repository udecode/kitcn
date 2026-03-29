import { getSession } from 'kitcn/auth';
import type { InferInsertModel } from 'kitcn/orm';
import { CRPCError } from 'kitcn/server';
import type { MutationCtx, QueryCtx } from '../../functions/generated/server';
import { accountTable, userTable } from '../../functions/schema';
import type { SessionUser } from '../../shared/auth-shared';
import { productToPlan } from '../../shared/polar-shared';
import type { AuthCtx } from '../crpc';

const getSessionData = async (ctx: QueryCtx) => {
  const session = await getSession(ctx);

  if (!session) {
    return null;
  }

  const activeOrganizationId = session.activeOrganizationId;

  const [user, subscription] = await Promise.all([
    ctx.orm.query.user.findFirst({
      where: { id: { eq: session.userId } },
    }),
    activeOrganizationId
      ? ctx.orm.query.subscriptions.findFirst({
          where: {
            organizationId: { eq: activeOrganizationId },
            status: 'active',
          },
        })
      : Promise.resolve(null),
  ]);

  if (!user) {
    return null;
  }

  let activeOrganization: SessionUser['activeOrganization'] = null;
  if (activeOrganizationId) {
    const [activeOrg, currentMember] = await Promise.all([
      ctx.orm.query.organization.findFirst({
        where: { id: { eq: activeOrganizationId } },
      }),
      ctx.orm.query.member.findFirst({
        where: {
          organizationId: { eq: activeOrganizationId },
          userId: { eq: session.userId },
        },
      }),
    ]);

    if (activeOrg) {
      const { id, ...rest } = activeOrg;
      activeOrganization = {
        ...rest,
        id,
        role: currentMember?.role ?? 'member',
      };
    }
  }

  return {
    activeOrganization,
    impersonatedBy: session.impersonatedBy,
    isAdmin: user.role === 'admin',
    plan: productToPlan(subscription?.productId),
    session,
    user,
  };
};

// Query to fetch user data for session/auth checks
export const getSessionUser = async (
  ctx: QueryCtx
): Promise<SessionUser | null> => {
  const data = await getSessionData(ctx);
  if (!data) {
    return null;
  }

  const { user, activeOrganization, impersonatedBy, isAdmin, plan, session } =
    data;

  const { id, ...userFields } = user;

  return {
    ...userFields,
    id,
    activeOrganization,
    impersonatedBy,
    isAdmin,
    plan,
    session,
  };
};

export const createUser = async (
  ctx: MutationCtx,
  args: {
    email: string;
    name: string;
    bio?: string | null;
    github?: string | null;
    image?: string | null;
    location?: string | null;
    role?: 'admin' | 'user';
  }
) => {
  const now = new Date();
  const createData: Record<string, unknown> = {
    bio: args.bio,
    createdAt: now,
    email: args.email,
    emailVerified: false,
    github: args.github,
    image: args.image,
    location: args.location,
    name: args.name,
    role: args.role ?? 'user',
    updatedAt: now,
  };

  const [{ id: userId }] = await ctx.orm
    .insert(userTable)
    .values(createData as InferInsertModel<typeof userTable>)
    .returning({ id: userTable.id });

  // Create account record for credential provider
  await ctx.orm.insert(accountTable).values({
    accountId: userId,
    createdAt: now,
    password: Math.random().toString(36).slice(-12), // Random password
    providerId: 'credential',
    updatedAt: now,
    userId,
  });

  return userId;
};

export const hasPermission = async (
  ctx: AuthCtx,
  body: NonNullable<Parameters<typeof ctx.auth.api.hasPermission>[0]>['body'],
  shouldThrow = true
) => {
  try {
    const canUpdate = await ctx.auth.api.hasPermission({
      body,
      headers: ctx.auth.headers,
    });

    if (!canUpdate.success) {
      if (!shouldThrow) {
        return false;
      }
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions for this action',
      });
    }

    return true;
  } catch (err) {
    if (!shouldThrow) {
      return false;
    }
    throw err;
  }
};
