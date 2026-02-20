import { eq } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import type { MutationCtx } from '../functions/generated';
import { memberTable, organizationTable, userTable } from '../functions/schema';
import type { AuthCtx } from './crpc';

export const listUserOrganizations = async (ctx: AuthCtx, userId: string) => {
  const memberships = await ctx.orm.query.member.findMany({
    where: { userId: { eq: userId } },
    orderBy: { createdAt: 'asc' },
    with: { organization: true },
  });

  if (!memberships.length) {
    return [];
  }

  return memberships.map((membership) => {
    const org = membership.organization;
    if (!org) {
      throw new CRPCError({
        code: 'NOT_FOUND',
        message: 'Membership organization not found',
      });
    }
    return { ...org, role: membership.role || 'member' };
  });
};

export const createPersonalOrganization = async (
  ctx: MutationCtx,
  args: {
    email: string;
    image: string | null;
    name: string;
    userId: string;
  }
) => {
  const userId = args.userId;

  // Check if user already has any organizations
  const user = await ctx.orm.query.user.findFirstOrThrow({
    where: { id: userId },
  });

  if (user.personalOrganizationId) {
    return null;
  }

  // Generate unique slug for personal org
  const slug = `personal-${args.userId.slice(-8)}`;

  const [org] = await ctx.orm
    .insert(organizationTable)
    .values({
      logo: args.image,
      monthlyCredits: 0,
      name: `${args.name}'s Organization`,
      slug,
      createdAt: new Date(),
    })
    .returning();
  const orgId = org.id;

  await ctx.orm.insert(memberTable).values({
    createdAt: new Date(),
    role: 'owner',
    organizationId: orgId,
    userId,
  });

  // Update the user's last active organization and personal organization ID for future sessions
  await ctx.orm
    .update(userTable)
    .set({
      lastActiveOrganizationId: orgId,
      personalOrganizationId: orgId,
    })
    .where(eq(userTable.id, userId));

  return {
    id: orgId,
    slug,
  };
};
