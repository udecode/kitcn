import { eq } from 'better-convex/orm';
import { CRPCError } from 'better-convex/server';
import { z } from 'zod';
import { hasPermission } from '../lib/auth/auth-helpers';
import {
  type AuthCtx,
  authMutation,
  authQuery,
  privateMutation,
} from '../lib/crpc';
import { createOrganizationHandler } from './generated/organization.runtime';
import type { MutationCtx } from './generated/server';
import {
  invitationTable,
  memberTable,
  organizationTable,
  userTable,
} from './schema';

// Maximum members per organization (including pending invitations)
const MEMBER_LIMIT = 5;
// Default limit for listing operations to prevent unbounded queries
const DEFAULT_LIST_LIMIT = 100;
const DEFAULT_PLAN = 'free';

export const createPersonalOrganization = privateMutation
  .input(
    z.object({
      image: z.string().nullish(),
      name: z.string(),
      userId: z.string(),
    })
  )
  .output(z.object({ id: z.string(), slug: z.string() }).nullable())
  .mutation(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirstOrThrow({
      where: { id: input.userId },
    });

    if (user.personalOrganizationId) {
      return null;
    }

    const slug = `personal-${input.userId.slice(-8)}`;

    const [org] = await ctx.orm
      .insert(organizationTable)
      .values({
        logo: input.image ?? null,
        monthlyCredits: 0,
        name: `${input.name}'s Organization`,
        slug,
        createdAt: new Date(),
      })
      .returning();
    const orgId = org.id;

    await ctx.orm.insert(memberTable).values({
      createdAt: new Date(),
      role: 'owner',
      organizationId: orgId,
      userId: input.userId,
    });

    await ctx.orm
      .update(userTable)
      .set({
        lastActiveOrganizationId: orgId,
        personalOrganizationId: orgId,
      })
      .where(eq(userTable.id, input.userId));

    return {
      id: orgId,
      slug,
    };
  });

export const listUserOrganizations = authQuery
  .output(
    z.array(
      z.object({
        createdAt: z.date(),
        id: z.string(),
        logo: z.string().nullish(),
        name: z.string(),
        role: z.string(),
        slug: z.string(),
      })
    )
  )
  .query(async ({ ctx }) => {
    const memberships = await ctx.orm.query.member.findMany({
      where: { userId: { eq: ctx.userId } },
      orderBy: { createdAt: 'asc' },
      with: { organization: true },
    });

    if (!memberships.length) {
      return [];
    }

    return memberships.map((membership) => {
      const organization = membership.organization;
      if (!organization) {
        throw new CRPCError({
          code: 'NOT_FOUND',
          message: 'Membership organization not found',
        });
      }
      return { ...organization, role: membership.role || 'member' };
    });
  });

// List all organizations for current user (excluding active organization)
export const listOrganizations = authQuery
  .output(
    z.object({
      canCreateOrganization: z.boolean(),
      organizations: z.array(
        z.object({
          id: z.string(),
          createdAt: z.date(),
          isPersonal: z.boolean(),
          logo: z.string().nullish(),
          name: z.string(),
          plan: z.string(),
          slug: z.string(),
        })
      ),
    })
  )
  .query(async ({ ctx }) => {
    const handler = createOrganizationHandler(ctx);
    const orgs = await handler.listUserOrganizations();

    if (!orgs || orgs.length === 0) {
      return {
        canCreateOrganization: true, // No orgs, can create first one
        organizations: [],
      };
    }

    const activeOrgId = ctx.user.activeOrganization?.id;

    // Calculate if user can create organization
    const canCreateOrganization = true;

    // Filter out active organization from the list to return (but keep all orgs for permission check above)
    const filteredOrgs = orgs.filter((org) => org.id !== activeOrgId);

    // Enrich organizations with plan data
    const enrichedOrgs = filteredOrgs.map((org) => ({
      id: org.id,
      createdAt: org.createdAt,
      isPersonal: org.id === ctx.user.personalOrganizationId,
      logo: org.logo || null,
      name: org.name,
      plan: DEFAULT_PLAN,
      slug: org.slug,
    }));

    return {
      canCreateOrganization,
      organizations: enrichedOrgs,
    };
  });

// Create a new organization (max 1 without subscription)
export const createOrganization = authMutation
  .meta({ rateLimit: 'organization/create' })
  .input(z.object({ name: z.string().min(1).max(100) }))
  .output(z.object({ id: z.string(), slug: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Generate unique slug
    let slug = input.name;
    let attempt = 0;

    while (attempt < 10) {
      // Check if slug is already taken
      const existingOrg = await ctx.orm.query.organization.findFirst({
        where: { slug },
      });

      if (!existingOrg) {
        break; // Slug is available!
      }

      // Add random suffix for uniqueness
      slug = `${slug}-${Math.random().toString(36).slice(2, 10)}`;
      attempt++;
    }

    if (attempt >= 10) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message:
          'Could not generate a unique slug. Please provide a custom slug.',
      });
    }

    // Create organization via Better Auth
    const org = await ctx.auth.api.createOrganization({
      body: {
        monthlyCredits: 0,
        name: input.name,
        slug,
      },
      headers: ctx.auth.headers,
    });

    if (!org) {
      throw new CRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create organization',
      });
    }

    await setActiveOrganizationHandler(ctx, {
      organizationId: org.id,
    });

    return {
      id: org.id,
      slug: org.slug,
    };
  });

// Update organization details
export const updateOrganization = authMutation
  .meta({ rateLimit: 'organization/update' })
  .input(
    z.object({
      organizationId: z.string(),
      logo: z.string().url().optional(),
      name: z.string().min(1).max(100).optional(),
      slug: z.string().optional(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    const user = ctx.user;

    await hasPermission(ctx, {
      organizationId: input.organizationId,
      permissions: { organization: ['update'] },
    });

    let slug = input.slug;

    // If slug is provided, validate it
    if (input.slug) {
      if (input.organizationId === user.personalOrganizationId) {
        slug = undefined;
      } else {
        slugSchema.parse(input.slug);

        // Check if slug is taken
        const existingOrg = await ctx.orm.query.organization.findFirst({
          where: { slug: slug! },
        });

        if (existingOrg && existingOrg.id !== input.organizationId) {
          throw new CRPCError({
            code: 'BAD_REQUEST',
            message: 'This slug is already taken',
          });
        }
      }
    }

    const data: {
      logo?: string;
      name?: string;
      slug?: string;
    } = {};
    if (input.logo !== undefined) data.logo = input.logo;
    if (input.name !== undefined) data.name = input.name;
    if (slug !== undefined) data.slug = slug;

    await ctx.auth.api.updateOrganization({
      body: { data, organizationId: input.organizationId },
      headers: ctx.auth.headers,
    });
  });

const slugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9-]+$/);

const getInvitationOverview = async (
  ctx: AuthCtx,
  input: {
    inviteId?: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    userEmail: string;
  }
) => {
  const invitation = input.inviteId
    ? await ctx.orm.query.invitation.findFirst({
        where: { id: input.inviteId, organizationId: input.organizationId },
        with: { inviter: true },
      })
    : await ctx.orm.query.invitation.findFirst({
        where: {
          email: input.userEmail,
          organizationId: input.organizationId,
          status: 'pending',
        },
        with: { inviter: true },
      });

  if (!invitation) {
    return null;
  }

  const inviter = invitation.inviter;
  if (!inviter) {
    throw new CRPCError({
      code: 'NOT_FOUND',
      message: 'Inviter not found',
    });
  }

  return {
    id: invitation.id,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    inviterEmail: inviter.email,
    inviterId: invitation.inviterId,
    inviterName: inviter.name,
    inviterUsername: inviter.username ?? null,
    organizationId: invitation.organizationId,
    organizationName: input.organizationName,
    organizationSlug: input.organizationSlug,
    role: invitation.role ?? 'member',
    status: invitation.status,
  };
};

const setActiveOrganizationHandler = async (
  ctx: AuthCtx<MutationCtx>,
  args: { organizationId: string }
) => {
  await ctx.auth.api.setActiveOrganization({
    body: { organizationId: args.organizationId },
    headers: ctx.auth.headers,
  });

  // Skip updating lastActiveOrganizationId to avoid aggregate issues
  // The active organization is already tracked in the session
};

// Set active organization
export const setActiveOrganization = authMutation
  .meta({ rateLimit: 'organization/setActive' })
  .input(z.object({ organizationId: z.string() }))

  .mutation(async ({ ctx, input }) => setActiveOrganizationHandler(ctx, input));

// Accept invitation
export const acceptInvitation = authMutation
  .input(z.object({ invitationId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const user = ctx.user;

    // Validate that the invitation is for the current user's email (optimized)
    const invitation = await ctx.orm.query.invitation
      .findFirstOrThrow({
        where: { id: input.invitationId, email: user.email },
      })
      .catch(() => {
        throw new CRPCError({
          code: 'FORBIDDEN',
          message: 'This invitation is not found for your email address',
        });
      });
    if (invitation.status !== 'pending') {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: 'This invitation has already been processed',
      });
    }

    await ctx.auth.api.acceptInvitation({
      body: { invitationId: input.invitationId },
      headers: ctx.auth.headers,
    });
  });

// Reject invitation
export const rejectInvitation = authMutation
  .meta({ rateLimit: 'organization/rejectInvite' })
  .input(z.object({ invitationId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const user = ctx.user;

    // Get the specific invitation directly
    const invitation = await ctx.orm.query.invitation
      .findFirstOrThrow({
        where: { id: input.invitationId, email: user.email },
      })
      .catch(() => {
        throw new CRPCError({
          code: 'FORBIDDEN',
          message: 'This invitation is not found for your email address',
        });
      });
    if (invitation.status !== 'pending') {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: 'This invitation has already been processed',
      });
    }

    await ctx.auth.api.rejectInvitation({
      body: { invitationId: input.invitationId },
      headers: ctx.auth.headers,
    });
  });

// Remove member from organization
export const removeMember = authMutation
  .meta({ rateLimit: 'organization/removeMember' })
  .input(z.object({ memberId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const member = await ctx.orm.query.member.findFirstOrThrow({
      where: { id: input.memberId },
    });

    // Permission: member delete
    await hasPermission(ctx, {
      organizationId: member.organizationId,
      permissions: { member: ['delete'] },
    });

    await ctx.auth.api.removeMember({
      body: {
        memberIdOrEmail: input.memberId,
        organizationId: member.organizationId,
      },
      headers: ctx.auth.headers,
    });
  });

// Leave organization (self-leave)
export const leaveOrganization = authMutation
  .meta({ rateLimit: 'organization/leave' })
  .input(z.object({ organizationId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const user = ctx.user;

    // Prevent leaving personal organizations (similar to personal org deletion protection)
    // Personal organizations typically have a specific naming pattern or metadata
    if (input.organizationId === user.personalOrganizationId) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message:
          'You cannot leave your personal organization. Personal organizations are required for your account.',
      });
    }

    const currentMember = await ctx.orm.query.member
      .findFirstOrThrow({
        where: {
          organizationId: input.organizationId,
          userId: ctx.userId,
        },
      })
      .catch(() => {
        throw new CRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this organization',
        });
      });
    // Prevent the last owner from leaving the organization
    // (Organizations must have at least one owner)
    if (currentMember.role === 'owner') {
      // Use the compound index to efficiently find owners
      const owners = await ctx.orm.query.member.findMany({
        where: { organizationId: input.organizationId, role: 'owner' },
        limit: 2, // We only need to know if there's more than one owner
      });

      if (owners.length <= 1) {
        throw new CRPCError({
          code: 'FORBIDDEN',
          message:
            'Cannot leave organization as the only owner. Transfer ownership or add another owner first.',
        });
      }
    }

    await ctx.auth.api.leaveOrganization({
      body: { organizationId: input.organizationId },
      headers: ctx.auth.headers,
    });

    // Only switch active org if we just left the active org.
    if (input.organizationId === user.activeOrganization?.id) {
      await setActiveOrganizationHandler(ctx, {
        organizationId: user.personalOrganizationId!,
      });
    }
  });

// Update member role
export const updateMemberRole = authMutation
  .meta({ rateLimit: 'organization/updateRole' })
  .input(
    z.object({
      memberId: z.string(),
      role: z.enum(['owner', 'member']),
    })
  )

  .mutation(async ({ ctx, input }) => {
    const member = await ctx.orm.query.member.findFirstOrThrow({
      where: { id: input.memberId },
    });

    // Permission: member update
    await hasPermission(ctx, {
      organizationId: member.organizationId,
      permissions: { member: ['update'] },
    });

    await ctx.auth.api.updateMemberRole({
      body: {
        memberId: input.memberId,
        organizationId: member.organizationId,
        role: input.role,
      },
      headers: ctx.auth.headers,
    });
  });

// Delete organization (owner only)
export const deleteOrganization = authMutation
  .input(z.object({ organizationId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const user = ctx.user;

    // Permission: organization delete
    await hasPermission(ctx, {
      organizationId: input.organizationId,
      permissions: { organization: ['delete'] },
    });

    // Prevent deletion of personal organizations
    if (input.organizationId === user.personalOrganizationId) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message:
          'Personal organizations can be deleted only by deleting your account.',
      });
    }

    // If deleting the active org, switch away first so the session isn't left pointing at a deleted org.
    if (input.organizationId === user.activeOrganization?.id) {
      await setActiveOrganizationHandler(ctx, {
        organizationId: user.personalOrganizationId!,
      });
    }

    // Delete organization via Better Auth
    await ctx.auth.api.deleteOrganization({
      body: { organizationId: input.organizationId },
      headers: ctx.auth.headers,
    });
  });

// Get organization details by slug
export const getOrganization = authQuery
  .input(z.object({ slug: z.string() }))
  .output(
    z
      .object({
        id: z.string(),
        createdAt: z.date(),
        isActive: z.boolean(),
        isPersonal: z.boolean(),
        logo: z.string().nullish(),
        membersCount: z.number(),
        name: z.string(),
        plan: z.string(),
        role: z.string().optional(),
        slug: z.string(),
      })
      .nullable()
  )
  .query(async ({ ctx, input }) => {
    const user = ctx.user;

    // Get organization by slug using index
    const org = await ctx.orm.query.organization.findFirst({
      where: { slug: input.slug },
    });

    if (!org) {
      return null;
    }

    const [currentMember, memberRows] = await Promise.all([
      ctx.orm.query.member.findFirst({
        where: { organizationId: org.id, userId: ctx.userId },
      }),
      ctx.orm.query.member.findMany({
        where: { organizationId: org.id },
        limit: DEFAULT_LIST_LIMIT,
        columns: { id: true },
      }),
    ]);

    const plan = DEFAULT_PLAN;

    return {
      id: org.id,
      createdAt: org.createdAt,
      isActive: org.id === user.activeOrganization?.id,
      isPersonal: org.id === user.personalOrganizationId,
      logo: org.logo || null,
      membersCount: memberRows.length || 1,
      name: org.name,
      plan,
      role: currentMember?.role,
      slug: org.slug,
    };
  });

// Get organization overview with optional invitation details
export const getOrganizationOverview = authQuery
  .input(
    z.object({
      inviteId: z.string().optional(),
      slug: z.string(),
    })
  )
  .output(
    z
      .object({
        id: z.string(),
        createdAt: z.date(),
        invitation: z
          .object({
            id: z.string(),
            email: z.string(),
            expiresAt: z.date(),
            inviterEmail: z.string(),
            inviterId: z.string(),
            inviterName: z.string(),
            inviterUsername: z.string().nullable(),
            organizationId: z.string(),
            organizationName: z.string(),
            organizationSlug: z.string(),
            role: z.string(),
            status: z.string(),
          })
          .nullable(),
        isActive: z.boolean(),
        isPersonal: z.boolean(),
        logo: z.string().nullish(),
        membersCount: z.number(),
        name: z.string(),
        plan: z.string().optional(),
        role: z.string().optional(),
        slug: z.string(),
      })
      .nullable()
  )
  .query(async ({ ctx, input }) => {
    const user = ctx.user;

    // Get organization details
    const org = await ctx.orm.query.organization.findFirst({
      where: { slug: input.slug },
    });

    if (!org) {
      return null;
    }

    // Get current membership (fast) + member count.
    // Avoid relying on the active organization: we're scoping by the org in the URL.
    const [currentMember, memberRows] = await Promise.all([
      ctx.orm.query.member.findFirst({
        where: { organizationId: org.id, userId: ctx.userId },
      }),
      ctx.orm.query.member.findMany({
        where: { organizationId: org.id },
        limit: DEFAULT_LIST_LIMIT,
        columns: { id: true },
      }),
    ]);

    const organizationData = {
      id: org.id,
      createdAt: org.createdAt,
      isActive: user.activeOrganization?.id === org.id,
      isPersonal: org.id === user.personalOrganizationId,
      logo: org.logo,
      membersCount: memberRows.length || 1,
      name: org.name,
      plan: undefined,
      role: currentMember?.role,
      slug: org.slug,
    };

    const invitationData = await getInvitationOverview(ctx, {
      inviteId: input.inviteId,
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      userEmail: user.email,
    });

    if (!(currentMember || invitationData)) {
      return null;
    }

    return {
      ...organizationData,
      invitation: invitationData,
    };
  });

// List members by organization slug
export const listMembers = authQuery
  .input(z.object({ slug: z.string() }))
  .output(
    z.object({
      currentUserRole: z.string().optional(),
      isPersonal: z.boolean(),
      members: z.array(
        z.object({
          id: z.string(),
          createdAt: z.date(),
          organizationId: z.string(),
          role: z.string().optional(),
          user: z.object({
            id: z.string(),
            email: z.string(),
            image: z.string().nullish(),
            name: z.string().nullable(),
          }),
          userId: z.string(),
        })
      ),
    })
  )
  .query(async ({ ctx, input }) => {
    const user = ctx.user;
    const org = await ctx.orm.query.organization.findFirst({
      where: { slug: input.slug },
    });

    if (!org) {
      return {
        isPersonal: false,
        members: [],
      };
    }

    const currentMember = await ctx.orm.query.member.findFirst({
      where: { organizationId: org.id, userId: ctx.userId },
    });
    if (!currentMember) {
      return {
        isPersonal: org.id === user.personalOrganizationId,
        members: [],
      };
    }

    const members = await ctx.orm.query.member.findMany({
      where: { organizationId: org.id },
      limit: DEFAULT_LIST_LIMIT,
      with: { user: true },
    });

    if (!members || members.length === 0) {
      return {
        isPersonal: org.id === user.personalOrganizationId,
        members: [],
      };
    }

    const enrichedMembers = members
      .map((member) => {
        const memberUser = member.user;
        if (!memberUser) return null;

        return {
          id: member.id,
          createdAt: member.createdAt,
          organizationId: org.id,
          role: member.role,
          user: {
            id: memberUser.id,
            email: memberUser.email,
            image: memberUser.image,
            name: memberUser.name,
          },
          userId: member.userId,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    return {
      currentUserRole: currentMember.role,
      isPersonal: org.id === user.personalOrganizationId,
      members: enrichedMembers,
    };
  });

// List pending invitations by organization slug
export const listPendingInvitations = authQuery
  .input(z.object({ slug: z.string() }))
  .output(
    z.array(
      z.object({
        id: z.string(),
        createdAt: z.date(),
        email: z.string(),
        expiresAt: z.date(),
        organizationId: z.string(),
        role: z.string(),
        status: z.string(),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    // Get organization by slug using index
    const org = await ctx.orm.query.organization.findFirst({
      where: { slug: input.slug },
    });

    if (!org) {
      return [];
    }

    const canManageInvites = await hasPermission(
      ctx,
      { organizationId: org.id, permissions: { invitation: ['create'] } },
      false
    );

    if (!canManageInvites) {
      return [];
    }

    // Get pending invitations directly using the organizationId_status index
    // Limited to 100 to prevent unbounded queries with many invitations
    const invitationRows = await ctx.orm.query.invitation.findMany({
      where: { organizationId: org.id, status: 'pending' },
      limit: DEFAULT_LIST_LIMIT,
      columns: {
        id: true,
        createdAt: true,
        email: true,
        expiresAt: true,
        organizationId: true,
        role: true,
        status: true,
      },
    });

    const pendingInvitations = invitationRows.map((invitation) => ({
      id: invitation.id,
      createdAt: invitation.createdAt,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      role: invitation.role || 'member',
      status: invitation.status,
    }));

    return pendingInvitations;
  });

// Invite member to organization by slug
export const inviteMember = authMutation
  .meta({ rateLimit: 'organization/invite' })
  .input(
    z.object({
      email: z.string().email(),
      organizationId: z.string(),
      role: z.enum(['owner', 'member']),
    })
  )

  .mutation(async ({ ctx, input }) => {
    // Premium guard for invitations
    // premiumGuard(ctx.user);

    // Permission: invitation create
    await hasPermission(ctx, {
      organizationId: input.organizationId,
      permissions: { invitation: ['create'] },
    });

    // Check member count limit (5 members max per organization)
    // Get all members for this organization
    const members = await ctx.orm.query.member.findMany({
      where: { organizationId: input.organizationId },
      limit: DEFAULT_LIST_LIMIT,
    });

    // Check current member count (including pending invitations)
    const currentMemberCount = members.length;

    // Get pending invitations count
    // Count pending invitations to check against member limit
    const pendingInvitations = await ctx.orm.query.invitation.findMany({
      where: { organizationId: input.organizationId, status: 'pending' },
      limit: DEFAULT_LIST_LIMIT,
    }); // Limited query for counting

    const pendingCount = pendingInvitations?.length || 0;
    const totalCount = currentMemberCount + pendingCount;

    // Check against limit (5 members)
    if (totalCount >= MEMBER_LIMIT) {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: `Organization member limit reached. Maximum ${MEMBER_LIMIT} members allowed (${currentMemberCount} current, ${pendingCount} pending invitations).`,
      });
    }

    // Could check if user has opted out of organization invitations

    // Check for existing pending invitations and cancel them
    // Using the email_organizationId_status index for efficient lookup
    const existingInvitations = await ctx.orm.query.invitation.findMany({
      where: {
        email: input.email,
        organizationId: input.organizationId,
        status: 'pending',
      },
      limit: DEFAULT_LIST_LIMIT,
    });

    // Cancel existing invitations by updating their status
    for (const existingInvitation of existingInvitations) {
      await ctx.orm
        .update(invitationTable)
        .set({ status: 'canceled' })
        .where(eq(invitationTable.id, existingInvitation.id));
    }

    // Check if user is already a member.
    // Look up the user by email, then membership by (organizationId, userId) which is indexed.
    const existingUser = await ctx.orm.query.user.findFirst({
      where: { email: input.email },
    });
    if (existingUser) {
      const existingMember = await ctx.orm.query.member.findFirst({
        where: {
          organizationId: input.organizationId,
          userId: existingUser.id,
        },
      });
      if (existingMember) {
        throw new CRPCError({
          code: 'CONFLICT',
          message: `${input.email} is already a member of this organization`,
        });
      }
    }

    // Create new invitation via Better Auth API (triggers configured email)
    // Create new invitation directly
    try {
      const { id: invitationId } = await ctx.auth.api.createInvitation({
        body: {
          email: input.email,
          organizationId: input.organizationId,
          role: input.role,
        },
        headers: ctx.auth.headers,
      });

      if (!invitationId) {
        throw new CRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create invitation',
        });
      }
    } catch (error) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: `Failed to send invitation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  });

// Cancel invitation
export const cancelInvitation = authMutation
  .meta({ rateLimit: 'organization/cancelInvite' })
  .input(z.object({ invitationId: z.string() }))

  .mutation(async ({ ctx, input }) => {
    const invitation = await ctx.orm.query.invitation.findFirstOrThrow({
      where: { id: input.invitationId },
    });

    // Permission: invitation cancel
    await hasPermission(ctx, {
      organizationId: invitation.organizationId,
      permissions: { invitation: ['cancel'] },
    });

    // Cancel the invitation in Better Auth
    try {
      await ctx.auth.api.cancelInvitation({
        body: { invitationId: input.invitationId },
        headers: ctx.auth.headers,
      });
    } catch (error) {
      if (error instanceof Error && error.message?.includes('not found')) {
        throw new CRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found or already processed',
        });
      }

      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: `Failed to cancel invitation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    // Note: Email cancellation through Resend is non-critical
    // The invitation being cancelled is the primary action
  });

// Check if slug is available
export const checkSlug = authQuery
  .input(z.object({ slug: z.string() }))
  .output(z.object({ available: z.boolean() }))
  .query(async ({ ctx, input }) => {
    const existing = await ctx.orm.query.organization.findFirst({
      where: { slug: input.slug },
    });
    return { available: !existing };
  });

// List invitations for the current user
export const listUserInvitations = authQuery
  .output(
    z.array(
      z.object({
        id: z.string(),
        expiresAt: z.date(),
        inviterName: z.string().nullable(),
        organizationName: z.string(),
        organizationSlug: z.string(),
        role: z.string(),
      })
    )
  )
  .query(async ({ ctx }) => {
    const invitations = await ctx.orm.query.invitation.findMany({
      where: { email: ctx.user.email, status: 'pending' },
      limit: DEFAULT_LIST_LIMIT,
      columns: {
        id: true,
        expiresAt: true,
        organizationId: true,
        inviterId: true,
        role: true,
      },
      with: {
        organization: { columns: { name: true, slug: true } },
        inviter: { columns: { name: true } },
      },
    });

    return invitations.map((inv) => {
      const org = inv.organization;
      if (!org) {
        throw new CRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        });
      }
      return {
        id: inv.id,
        expiresAt: inv.expiresAt,
        inviterName: inv.inviter?.name ?? null,
        organizationName: org.name,
        organizationSlug: org.slug,
        role: inv.role || 'member',
      };
    });
  });

// Get current user's active membership
export const getActiveMember = authQuery
  .output(
    z
      .object({
        id: z.string(),
        createdAt: z.date(),
        role: z.string(),
      })
      .nullable()
  )
  .query(async ({ ctx }) => {
    if (!ctx.user.activeOrganization) return null;

    const member = await ctx.orm.query.member.findFirst({
      where: {
        organizationId: ctx.user.activeOrganization!.id,
        userId: ctx.userId,
      },
    });

    if (!member) return null;

    return {
      id: member.id,
      createdAt: member.createdAt,
      role: member.role,
    };
  });

// Add member directly without invitation (admin use)
export const addMember = authMutation
  .meta({ rateLimit: 'organization/addMember' })
  .input(
    z.object({
      role: z.enum(['owner', 'member']),
      userId: z.string(),
    })
  )

  .mutation(async ({ ctx, input }) => {
    await hasPermission(ctx, { permissions: { member: ['create'] } });

    await ctx.auth.api.addMember({
      body: {
        organizationId: ctx.user.activeOrganization!.id,
        role: input.role,
        userId: input.userId,
      },
      headers: ctx.auth.headers,
    });
  });
