# Auth Organizations Plugin

Multi-tenant organization features via Better Auth plugin. Organizations, members, invitations, teams, RBAC, lifecycle hooks.

Prerequisites: `setup/auth.md`, `setup/server.md`.

See [Better Auth Organization Plugin](https://www.better-auth.com/docs/plugins/organization) for full API reference.

## Server Config

```ts
// convex/functions/auth.ts
import { organization } from 'better-auth/plugins';
import type { ActionCtx } from './generated/server';
import { defineAuth } from './generated/auth';

export default defineAuth((ctx) => ({
    plugins: [
      convex({ authConfig, jwks: process.env.JWKS }),
      admin(),
      organization({
        ac,
        roles,
        allowUserToCreateOrganization: true,
        organizationLimit: 5,
        membershipLimit: 100,
        creatorRole: 'owner',
        invitationExpiresIn: 48 * 60 * 60, // 48 hours
        teams: { enabled: true, maximumTeams: 10 },
        sendInvitationEmail: async (data) => {
          await (ctx as ActionCtx).scheduler.runAfter(
            0, internal.email.sendOrganizationInviteEmail,
            {
              acceptUrl: `${process.env.SITE_URL!}/w/${data.organization.slug}?invite=${data.id}`,
              invitationId: data.id,
              inviterEmail: data.inviter.user.email,
              inviterName: data.inviter.user.name || 'Team Admin',
              organizationName: data.organization.name,
              role: data.role,
              to: data.email,
            }
          );
        },
      }),
    ],
  }));
```

## Client Config

```ts
// src/lib/convex/auth-client.ts
import { organizationClient } from 'better-auth/client/plugins';
import { ac, roles } from '@convex/auth-shared';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<Auth>(),
    convexClient(),
    organizationClient({ ac, roles, teams: { enabled: true } }),
  ],
});
```

## Schema

```ts
// convex/functions/schema.ts
import { convexTable, defineSchema, id, index, integer, json, text, timestamp } from 'better-convex/orm';

export const organization = convexTable('organization', {
  name: text().notNull(),
  slug: text().notNull(),
  logo: text(),
  createdAt: timestamp().notNull().defaultNow(),
  metadata: json<Record<string, unknown>>(),
}, (t) => [index('slug').on(t.slug), index('name').on(t.name)]);

export const member = convexTable('member', {
  organizationId: id('organization').notNull(),
  userId: id('user').notNull(),
  role: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
}, (t) => [
  index('userId').on(t.userId),
  index('organizationId_userId').on(t.organizationId, t.userId),
  index('organizationId_role').on(t.organizationId, t.role),
]);

export const invitation = convexTable('invitation', {
  organizationId: id('organization').notNull(),
  inviterId: id('user').notNull(),
  email: text().notNull(),
  role: text(),
  status: text().notNull(),
  expiresAt: integer().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
}, (t) => [
  index('email').on(t.email),
  index('status').on(t.status),
  index('email_organizationId_status').on(t.email, t.organizationId, t.status),
  index('organizationId_status').on(t.organizationId, t.status),
]);

// Add to existing session table
export const session = convexTable('session', {
  // ... existing session fields
  activeOrganizationId: id('organization'),
  activeTeamId: id('team'),
});
```

### Teams (Optional)

```ts
export const team = convexTable('team', {
  name: text().notNull(),
  organizationId: id('organization').notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: integer(),
}, (t) => [index('organizationId').on(t.organizationId)]);

export const teamMember = convexTable('teamMember', {
  teamId: id('team').notNull(),
  userId: id('user').notNull(),
  createdAt: timestamp(),
}, (t) => [index('teamId').on(t.teamId), index('userId').on(t.userId)]);
```

### Additional Fields

Extend organization tables with custom fields in plugin config:

```ts
organization({
  schema: {
    organization: { fields: { description: v.optional(v.string()), website: v.optional(v.string()) } },
    member: { fields: { title: v.optional(v.string()), department: v.optional(v.string()) } },
    invitation: { fields: { message: v.optional(v.string()) } },
  },
}),
```

Then add matching columns in your schema.

## Access Control

### Basic Setup

```ts
// convex/shared/auth-shared.ts
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access';

const statement = { ...defaultStatements } as const;
export const ac = createAccessControl(statement);

const member = ac.newRole({ ...memberAc.statements });
const owner = ac.newRole({ ...ownerAc.statements });
export const roles = { member, owner };
```

### Custom Permissions

```ts
const statement = {
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
  billing: ['read', 'update'],
  analytics: ['read'],
} as const;

export const ac = createAccessControl(statement);

const viewer = ac.newRole({ project: ['read'], analytics: ['read'] });
const editor = ac.newRole({ ...memberAc.statements, project: ['create', 'read', 'update'], analytics: ['read'] });
const admin = ac.newRole({
  ...ownerAc.statements,
  project: ['create', 'read', 'update', 'delete'],
  billing: ['read', 'update'],
  analytics: ['read'],
});
export const roles = { viewer, editor, admin };
```

### Check Role Permission

```ts
const canEdit = ac.checkRolePermission({ role: 'editor', permission: { project: ['update'] } });
```

### Dynamic Access Control

```ts
organization({
  ac: {
    ...ac,
    resolveRole: async ({ role, organizationId }) => {
      if (roles[role]) return roles[role];
      const customRole = await ctx.orm.query.customRole.findFirst({ where: { name: role, organizationId } });
      if (customRole) return ac.newRole(customRole.permissions);
      return null;
    },
  },
}),
```

### Permission Helper

```ts
// convex/lib/auth/auth-helpers.ts
import { CRPCError } from 'better-convex/server';
import type { AuthCtx } from '../crpc';

export const hasPermission = async (
  ctx: AuthCtx,
  body: { permissions: Record<string, string[]> },
  shouldThrow = true
) => {
  const result = await ctx.auth.api.hasPermission({ body, headers: ctx.auth.headers });
  if (shouldThrow && !result.success) {
    throw new CRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
  }
  return result.success;
};
```

## Organization Functions

**Pattern:** Better Auth API for multi-table ops (create, delete, invitations). `ctx.orm` for simple reads/updates.

Example-parity helper module:
- `convex/lib/organization-helpers.ts` for shared organization listing and personal-organization bootstrap logic.

### Check Slug

```ts
export const checkSlug = authQuery
  .input(z.object({ slug: z.string() }))
  .output(z.object({ available: z.boolean() }))
  .query(async ({ ctx, input }) => {
    const existing = await ctx.orm.query.organization.findFirst({ where: { slug: input.slug } });
    return { available: !existing };
  });
```

### List Organizations

```ts
export const listOrganizations = authQuery
  .output(z.object({
    canCreateOrganization: z.boolean(),
    organizations: z.array(z.object({
      id: z.string(), createdAt: z.date(), isPersonal: z.boolean(),
      logo: z.string().nullish(), name: z.string(), plan: z.string(), slug: z.string(),
    })),
  }))
  .query(async ({ ctx }) => {
    const orgs = await listUserOrganizations(ctx, ctx.userId);
    if (!orgs?.length) return { canCreateOrganization: true, organizations: [] };

    const activeOrgId = ctx.user.activeOrganization?.id;
    const organizations = orgs
      .filter((org) => org.id !== activeOrgId)
      .map((org) => ({
        id: org.id, createdAt: org.createdAt, isPersonal: org.id === ctx.user.personalOrganizationId,
        logo: org.logo || null, name: org.name, plan: DEFAULT_PLAN, slug: org.slug,
      }));
    return { canCreateOrganization: true, organizations };
  });
```

### Create Organization

```ts
export const createOrganization = authMutation
  .meta({ rateLimit: 'organization/create' })
  .input(z.object({ name: z.string().min(1).max(100) }))
  .output(z.object({ id: z.string(), slug: z.string() }))
  .mutation(async ({ ctx, input }) => {
    let slug = input.name;
    let attempt = 0;
    while (attempt < 10) {
      const existing = await ctx.orm.query.organization.findFirst({ where: { slug } });
      if (!existing) break;
      slug = `${slug}-${Math.random().toString(36).slice(2, 10)}`;
      attempt++;
    }
    if (attempt >= 10) throw new CRPCError({ code: 'BAD_REQUEST', message: 'Could not generate unique slug' });

    const org = await ctx.auth.api.createOrganization({
      body: { name: input.name, slug },
      headers: ctx.auth.headers,
    });
    if (!org) throw new CRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create organization' });

    await setActiveOrganizationHandler(ctx, { organizationId: org.id });
    return { id: org.id, slug: org.slug };
  });
```

### Update Organization

```ts
export const updateOrganization = authMutation
  .meta({ rateLimit: 'organization/update' })
  .input(z.object({
    organizationId: z.string(),
    logo: z.string().url().optional(),
    name: z.string().min(1).max(100).optional(),
    slug: z.string().optional(),
  }))
  
  .mutation(async ({ ctx, input }) => {
    await hasPermission(ctx, { organizationId: input.organizationId, permissions: { organization: ['update'] } });

    let slug = input.slug;
    if (input.slug) {
      if (input.organizationId === ctx.user.personalOrganizationId) {
        slug = undefined;
      } else {
        slugSchema.parse(input.slug);
        const existing = await ctx.orm.query.organization.findFirst({ where: { slug: input.slug } });
        if (existing && existing.id !== input.organizationId) {
          throw new CRPCError({ code: 'BAD_REQUEST', message: 'This slug is already taken' });
        }
      }
    }

    const data: { logo?: string; name?: string; slug?: string } = {};
    if (input.logo !== undefined) data.logo = input.logo;
    if (input.name !== undefined) data.name = input.name;
    if (slug !== undefined) data.slug = slug;

    await ctx.auth.api.updateOrganization({
      body: { data, organizationId: input.organizationId },
      headers: ctx.auth.headers,
    });
    return null;
  });
```

### Delete Organization

```ts
export const deleteOrganization = authMutation
  .input(z.object({ organizationId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    await hasPermission(ctx, { organizationId: input.organizationId, permissions: { organization: ['delete'] } });

    if (input.organizationId === ctx.user.personalOrganizationId) {
      throw new CRPCError({ code: 'FORBIDDEN', message: 'Personal organizations can be deleted only by deleting your account.' });
    }
    if (input.organizationId === ctx.user.activeOrganization?.id) {
      await setActiveOrganizationHandler(ctx, { organizationId: ctx.user.personalOrganizationId! });
    }

    await ctx.auth.api.deleteOrganization({
      body: { organizationId: input.organizationId },
      headers: ctx.auth.headers,
    });
    return null;
  });
```

### Set Active Organization

```ts
export const setActiveOrganization = authMutation
  .meta({ rateLimit: 'organization/setActive' })
  .input(z.object({ organizationId: z.string() }))
  
  .mutation(async ({ ctx, input }) => setActiveOrganizationHandler(ctx, input));
```

## Invitation Functions

### Send Invitation

```ts
export const inviteMember = authMutation
  .meta({ rateLimit: 'organization/invite' })
  .input(z.object({ email: z.string().email(), organizationId: z.string(), role: z.enum(['owner', 'member']) }))
  
  .mutation(async ({ ctx, input }) => {
    await hasPermission(ctx, { organizationId: input.organizationId, permissions: { invitation: ['create'] } });

    // Check member limit
    const members = await ctx.orm.query.member.findMany({ where: { organizationId: input.organizationId }, limit: DEFAULT_LIST_LIMIT });
    const pending = await ctx.orm.query.invitation.findMany({ where: { organizationId: input.organizationId, status: 'pending' }, limit: DEFAULT_LIST_LIMIT });
    if (members.length + pending.length >= MEMBER_LIMIT) {
      throw new CRPCError({ code: 'FORBIDDEN', message: `Organization member limit reached. Maximum ${MEMBER_LIMIT} members allowed.` });
    }

    // Cancel existing pending invites for same email
    const existing = await ctx.orm.query.invitation.findMany({ where: { email: input.email, organizationId: input.organizationId, status: 'pending' }, limit: DEFAULT_LIST_LIMIT });
    for (const inv of existing) {
      await ctx.orm.update(invitation).set({ status: 'canceled' }).where(eq(invitation.id, inv.id));
    }

    await ctx.auth.api.createInvitation({
      body: { email: input.email, organizationId: input.organizationId, role: input.role },
      headers: ctx.auth.headers,
    });
    return null;
  });
```

### Accept / Reject / Cancel

```ts
export const acceptInvitation = authMutation
  .input(z.object({ invitationId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    const inv = await ctx.orm.query.invitation
      .findFirstOrThrow({ where: { id: input.invitationId, email: ctx.user.email } })
      .catch(() => { throw new CRPCError({ code: 'FORBIDDEN', message: 'Invitation not found for your email' }); });

    if (inv.status !== 'pending') throw new CRPCError({ code: 'BAD_REQUEST', message: 'Invitation already processed' });

    await ctx.auth.api.acceptInvitation({ body: { invitationId: input.invitationId }, headers: ctx.auth.headers });
    return null;
  });

export const rejectInvitation = authMutation
  .meta({ rateLimit: 'organization/rejectInvite' })
  .input(z.object({ invitationId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    const inv = await ctx.orm.query.invitation
      .findFirstOrThrow({ where: { id: input.invitationId, email: ctx.user.email } })
      .catch(() => { throw new CRPCError({ code: 'FORBIDDEN', message: 'Invitation not found for your email' }); });

    if (inv.status !== 'pending') throw new CRPCError({ code: 'BAD_REQUEST', message: 'Invitation already processed' });

    await ctx.auth.api.rejectInvitation({ body: { invitationId: input.invitationId }, headers: ctx.auth.headers });
    return null;
  });

export const cancelInvitation = authMutation
  .meta({ rateLimit: 'organization/cancelInvite' })
  .input(z.object({ invitationId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    const inv = await ctx.orm.query.invitation.findFirstOrThrow({ where: { id: input.invitationId } });
    await hasPermission(ctx, { organizationId: inv.organizationId, permissions: { invitation: ['cancel'] } });

    try {
      await ctx.auth.api.cancelInvitation({ body: { invitationId: input.invitationId }, headers: ctx.auth.headers });
    } catch (error) {
      if (error instanceof Error && error.message?.includes('not found')) {
        throw new CRPCError({ code: 'NOT_FOUND', message: 'Invitation not found or already processed' });
      }
      throw new CRPCError({ code: 'BAD_REQUEST', message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}` });
    }
    return null;
  });
```

### List User Invitations

```ts
export const listUserInvitations = authQuery
  .output(z.array(z.object({
    id: z.string(), expiresAt: z.date(), inviterName: z.string().nullable(),
    organizationName: z.string(), organizationSlug: z.string(), role: z.string(),
  })))
  .query(async ({ ctx }) => {
    const invitations = await ctx.orm.query.invitation.findMany({
      where: { email: ctx.user.email, status: 'pending' },
      limit: DEFAULT_LIST_LIMIT,
      columns: { id: true, expiresAt: true, organizationId: true, inviterId: true, role: true },
      with: { organization: { columns: { name: true, slug: true } }, inviter: { columns: { name: true } } },
    });

    return invitations.map((inv) => {
      const org = inv.organization;
      if (!org) throw new CRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      return {
        id: inv.id, expiresAt: inv.expiresAt, inviterName: inv.inviter?.name ?? null,
        organizationName: org.name, organizationSlug: org.slug, role: inv.role || 'member',
      };
    });
  });
```

### List Pending Invitations

```ts
export const listPendingInvitations = authQuery
  .input(z.object({ slug: z.string() }))
  .output(z.array(z.object({
    id: z.string(), createdAt: z.date(), email: z.string(), expiresAt: z.date(),
    organizationId: z.string(), role: z.string(), status: z.string(),
  })))
  .query(async ({ ctx, input }) => {
    const org = await ctx.orm.query.organization.findFirst({ where: { slug: input.slug } });
    if (!org) return [];

    const canManage = await hasPermission(ctx, { organizationId: org.id, permissions: { invitation: ['create'] } }, false);
    if (!canManage) return [];

    const invitations = await ctx.orm.query.invitation.findMany({
      where: { organizationId: org.id, status: 'pending' },
      limit: DEFAULT_LIST_LIMIT,
      columns: { id: true, createdAt: true, email: true, expiresAt: true, organizationId: true, role: true, status: true },
    });

    return invitations.map((inv) => ({
      id: inv.id, createdAt: inv.createdAt, email: inv.email, expiresAt: inv.expiresAt,
      organizationId: inv.organizationId, role: inv.role || 'member', status: inv.status,
    }));
  });
```

## Member Functions

### Get Active Member

```ts
export const getActiveMember = authQuery
  .output(z.object({ id: z.string(), createdAt: z.date(), role: z.string() }).nullable())
  .query(async ({ ctx }) => {
    if (!ctx.user.activeOrganization) return null;
    const m = await ctx.orm.query.member.findFirst({
      where: { organizationId: ctx.user.activeOrganization.id, userId: ctx.userId },
    });
    if (!m) return null;
    return { id: m.id, createdAt: m.createdAt, role: m.role };
  });
```

### Add Member Directly

```ts
export const addMember = authMutation
  .meta({ rateLimit: 'organization/addMember' })
  .input(z.object({ role: z.enum(['owner', 'member']), userId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    await hasPermission(ctx, { permissions: { member: ['create'] } });
    await ctx.auth.api.addMember({
      body: { userId: input.userId, organizationId: ctx.user.activeOrganization!.id, role: input.role },
      headers: ctx.auth.headers,
    });
    return null;
  });
```

### List Members

```ts
export const listMembers = authQuery
  .input(z.object({ slug: z.string() }))
  .output(z.object({
    currentUserRole: z.string().optional(),
    isPersonal: z.boolean(),
    members: z.array(z.object({
      id: z.string(), createdAt: z.date(), organizationId: z.string(), role: z.string(),
      user: z.object({ id: z.string(), email: z.string(), image: z.string().nullish(), name: z.string().nullable() }),
      userId: z.string(),
    })),
  }))
  .query(async ({ ctx, input }) => {
    const org = await ctx.orm.query.organization.findFirst({ where: { slug: input.slug } });
    if (!org) return { isPersonal: false, members: [] };

    const currentMember = await ctx.orm.query.member.findFirst({
      where: { organizationId: org.id, userId: ctx.userId },
    });
    if (!currentMember) return { isPersonal: org.id === ctx.user.personalOrganizationId, members: [] };

    const members = await ctx.orm.query.member.findMany({
      where: { organizationId: org.id }, limit: DEFAULT_LIST_LIMIT, with: { user: true },
    });
    if (!members?.length) return { isPersonal: org.id === ctx.user.personalOrganizationId, members: [] };

    const enriched = members
      .map((m) => {
        if (!m.user) return null;
        return {
          id: m.id, createdAt: m.createdAt, organizationId: org.id, role: m.role,
          user: { id: m.user.id, email: m.user.email, image: m.user.image, name: m.user.name },
          userId: m.userId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return { currentUserRole: currentMember.role, isPersonal: org.id === ctx.user.personalOrganizationId, members: enriched };
  });
```

### Update Member Role

```ts
export const updateMemberRole = authMutation
  .meta({ rateLimit: 'organization/updateRole' })
  .input(z.object({ memberId: z.string(), role: z.enum(['owner', 'member']) }))
  
  .mutation(async ({ ctx, input }) => {
    const m = await ctx.orm.query.member.findFirstOrThrow({ where: { id: input.memberId } });
    await hasPermission(ctx, { organizationId: m.organizationId, permissions: { member: ['update'] } });

    await ctx.auth.api.updateMemberRole({
      body: { memberId: input.memberId, organizationId: m.organizationId, role: input.role },
      headers: ctx.auth.headers,
    });
    return null;
  });
```

### Remove Member

```ts
export const removeMember = authMutation
  .meta({ rateLimit: 'organization/removeMember' })
  .input(z.object({ memberId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    const m = await ctx.orm.query.member.findFirstOrThrow({ where: { id: input.memberId } });
    await hasPermission(ctx, { organizationId: m.organizationId, permissions: { member: ['delete'] } });

    await ctx.auth.api.removeMember({
      body: { memberIdOrEmail: input.memberId, organizationId: m.organizationId },
      headers: ctx.auth.headers,
    });
    return null;
  });
```

### Leave Organization

```ts
export const leaveOrganization = authMutation
  .meta({ rateLimit: 'organization/leave' })
  .input(z.object({ organizationId: z.string() }))
  
  .mutation(async ({ ctx, input }) => {
    if (input.organizationId === ctx.user.personalOrganizationId) {
      throw new CRPCError({ code: 'BAD_REQUEST', message: 'Cannot leave personal organization' });
    }

    const currentMember = await ctx.orm.query.member
      .findFirstOrThrow({ where: { organizationId: input.organizationId, userId: ctx.userId } })
      .catch(() => { throw new CRPCError({ code: 'FORBIDDEN', message: 'Not a member' }); });

    if (currentMember.role === 'owner') {
      const owners = await ctx.orm.query.member.findMany({
        where: { organizationId: input.organizationId, role: 'owner' }, limit: 2,
      });
      if (owners.length <= 1) {
        throw new CRPCError({ code: 'FORBIDDEN', message: 'Cannot leave as the only owner. Transfer ownership first.' });
      }
    }

    await ctx.auth.api.leaveOrganization({
      body: { organizationId: input.organizationId }, headers: ctx.auth.headers,
    });

    if (input.organizationId === ctx.user.activeOrganization?.id) {
      await setActiveOrganizationHandler(ctx, { organizationId: ctx.user.personalOrganizationId! });
    }
    return null;
  });
```

## Teams

Use Better Auth team APIs directly:

```ts
// List teams
const teams = await ctx.auth.api.listTeams({
  query: { organizationId: ctx.user.activeOrganization!.id },
  headers: ctx.auth.headers,
});

// Add/remove member
await ctx.auth.api.addTeamMember({ body: { teamId, userId }, headers: ctx.auth.headers });
await ctx.auth.api.removeTeamMember({ body: { teamId, userId }, headers: ctx.auth.headers });

// List team members
const members = await ctx.auth.api.listTeamMembers({ body: { teamId }, headers: ctx.auth.headers });
```

## Hooks

### Organization Hooks

```ts
organization({
  organizationCreation: {
    beforeCreate: async ({ organization, user }) => { return { data: organization }; },
    afterCreate: async ({ organization, member, user }) => { /* setup defaults */ },
  },
  organizationDeletion: {
    beforeDelete: async (data) => { /* cleanup */ },
    afterDelete: async (data) => { /* post-cleanup */ },
  },
}),
```

### Member Hooks

```ts
organization({
  membershipManagement: {
    beforeAddMember: async ({ organization, member, user }) => { return { data: member }; },
    afterAddMember: async ({ organization, member, user }) => { /* notifications */ },
    beforeRemoveMember: async ({ organization, member, user }) => { /* cleanup */ },
    afterRemoveMember: async ({ organization, member, user }) => { /* post-removal */ },
    beforeUpdateRole: async ({ organization, member, role }) => { return { data: { role } }; },
    afterUpdateRole: async ({ organization, member, role }) => { /* notifications */ },
  },
}),
```

### Invitation Hooks

```ts
organization({
  invitationManagement: {
    beforeCreateInvitation: async ({ invitation, organization, inviter }) => { return { data: invitation }; },
    afterCreateInvitation: async ({ invitation, organization, inviter }) => { /* notify */ },
    beforeAcceptInvitation: async ({ invitation, user }) => { return { data: invitation }; },
    afterAcceptInvitation: async ({ invitation, member, user }) => { /* welcome */ },
  },
}),
```

### Team Hooks

```ts
organization({
  teamManagement: {
    beforeCreateTeam: async ({ team, organization }) => { return { data: team }; },
    afterCreateTeam: async ({ team, organization }) => {},
    beforeAddTeamMember: async ({ team, user }) => { return { data: { team, user } }; },
    afterAddTeamMember: async ({ team, user }) => {},
  },
}),
```

## Client Usage

### React Hooks

```tsx
const { data: activeOrg } = authClient.useActiveOrganization();
const { data: orgs } = authClient.useListOrganizations();
authClient.organization.setActive({ organizationId: orgId });
authClient.organization.create({ name: 'New Org', slug: 'new-org' });
```

### Get Full Organization

```ts
const { data: fullOrg } = await authClient.organization.getFullOrganization({
  query: { organizationId: orgId },
});
// Returns: organization + members + invitations
```

### Invitation Operations (Client)

```ts
const { data: invitations } = await authClient.organization.listInvitations();
await authClient.organization.acceptInvitation({ invitationId });
await authClient.organization.rejectInvitation({ invitationId });
await authClient.organization.cancelInvitation({ invitationId });
```

### Member Operations (Client)

```ts
const { data: member } = await authClient.organization.getActiveMember();
await authClient.organization.leave();
await authClient.organization.removeMember({ memberIdOrEmail });
await authClient.organization.updateMemberRole({ memberId, role: 'admin' });
```

### Permission Check (Client)

```ts
const { data } = await authClient.organization.hasPermission({
  permissions: { organization: ['delete'] },
});
if (data?.success) { /* show delete button */ }
```

### Team Operations (Client)

```ts
const { data: teams } = await authClient.organization.listTeams();
await authClient.organization.createTeam({ name: 'Engineering' });
await authClient.organization.setActiveTeam({ teamId });
```

## API Reference

| Operation | Method | Multi-table |
|-----------|--------|-------------|
| Create org | Better Auth API | Yes |
| Update org | Better Auth API | No |
| Delete org | Better Auth API | Yes |
| List orgs | ORM | No |
| Check slug | ORM | No |
| Invite member | Better Auth API | Yes |
| Accept invite | Better Auth API | Yes |
| Reject invite | Better Auth API | Yes |
| Cancel invite | Better Auth API | Yes |
| List user invites | ORM | No |
| Add member | Better Auth API | Yes |
| Update role | Better Auth API | Yes |
| Remove member | Better Auth API | Yes |
| Leave org | Better Auth API | Yes |
| Create team | Better Auth API | Yes |
| Add team member | Better Auth API | Yes |
| Remove team member | Better Auth API | Yes |

Use Better Auth API for multi-table operations. Use `ctx.orm` for simple single-table reads/updates.
