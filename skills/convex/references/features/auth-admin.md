# Auth Admin Plugin

Role-based admin features: middleware, user management, banning, impersonation, custom permissions.

Prerequisites: `setup/auth.md`, `setup/server.md`.

See [Better Auth Admin Plugin](https://www.better-auth.com/docs/plugins/admin) for full API reference.

## Server Config

```ts
// convex/functions/auth.ts
import { admin } from 'better-auth/plugins';
import { defineAuth } from './generated/auth';

export default defineAuth((ctx) => ({
    plugins: [
      admin({
        defaultRole: 'user',
        // adminUserIds: ['user_id_1'], // Always admin regardless of role
        // impersonationSessionDuration: 60 * 60, // 1 hour default
        // defaultBanReason: 'No reason',
        // bannedUserMessage: 'You have been banned',
      }),
    ],
  }));
```

### Admin Assignment via Environment

```bash
# convex/.env
ADMIN=admin@domain.test,ops@domain.test
```

```ts
// convex/functions/auth.ts
import { defineAuth } from './generated/auth';

export default defineAuth((ctx) => ({
  triggers: {
    user: {
      create: {
        before: async (data, triggerCtx) => {
          const env = getEnv();
          const adminEmails = env.ADMIN;
          const role =
            data.role !== 'admin' && adminEmails?.includes(data.email)
              ? 'admin'
              : data.role;
          return { data: { ...data, role } };
        },
      },
    },
  },
}));
```

## Client Config

```ts
// src/lib/convex/auth-client.ts
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    // ... other plugins
  ],
});
```

## Schema

```ts
// convex/functions/schema.ts
import { boolean, convexTable, defineSchema, integer, text } from 'better-convex/orm';

export const user = convexTable('user', {
  // ... existing fields
  role: text(),           // 'admin' | 'user'
  banned: boolean(),
  banReason: text(),
  banExpires: integer(),
});

export const session = convexTable('session', {
  // ... existing fields
  impersonatedBy: text(), // Admin user ID during impersonation
});

export const tables = { user, session };
export default defineSchema(tables, { strict: false });
```

## Access Control

### Role Middleware

```ts
// convex/lib/crpc.ts
const c = initCRPC
  .meta<{ auth?: 'optional' | 'required'; role?: 'admin' }>()
  .create();

const roleMiddleware = c.middleware<object>(({ ctx, meta, next }) => {
  const user = (ctx as { user?: { role?: string | null } }).user;
  if (meta.role === 'admin' && user?.role !== 'admin') {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
  return next({ ctx });
});

export const authQuery = c.query
  .meta({ auth: 'required' })
  .use(devMiddleware)
  .use(authMiddleware)
  .use(roleMiddleware);

export const authMutation = c.mutation
  .meta({ auth: 'required' })
  .use(devMiddleware)
  .use(authMiddleware)
  .use(roleMiddleware)
  .use(rateLimitMiddleware);
```

### Role Guard Helper

```ts
// convex/lib/auth/role-guard.ts
import { CRPCError } from 'better-convex/server';

export function roleGuard(
  role: 'admin',
  user: { role?: string | null } | null
) {
  if (!user) {
    throw new CRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  }
  if (role === 'admin' && user.role !== 'admin') {
    throw new CRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
}
```

### Custom Access Control

```ts
// convex/shared/permissions.ts
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';

const statement = {
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ['create', 'read', 'update', 'delete'],
});

export const user = ac.newRole({
  project: ['create', 'read'],
});
```

Pass to plugins:

```ts
// Server
admin({ ac, roles: { admin, user } })

// Client (src/lib/convex/auth-client.ts)
adminClient({ ac, roles: { admin, user } })
```

## Admin Functions

### Check Admin Status

```ts
export const checkUserAdminStatus = authQuery
  .meta({ role: 'admin' })
  .input(z.object({ userId: z.string() }))
  .output(z.object({ isAdmin: z.boolean(), role: z.string().nullish() }))
  .query(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirstOrThrow({ where: { id: input.userId } });
    return { isAdmin: user.role === 'admin', role: user.role };
  });
```

### Update User Role

```ts
export const updateUserRole = authMutation
  .meta({ role: 'admin' })
  .input(z.object({ role: z.enum(['user', 'admin']), userId: z.string() }))
  .output(z.boolean())
  .mutation(async ({ ctx, input }) => {
    if (input.role === 'admin' && !ctx.user.isAdmin) {
      throw new CRPCError({ code: 'FORBIDDEN', message: 'Only admin can promote users to admin' });
    }

    const targetUser = await ctx.orm.query.user.findFirstOrThrow({ where: { id: input.userId } });

    if (targetUser.role === 'admin' && !ctx.user.isAdmin) {
      throw new CRPCError({ code: 'FORBIDDEN', message: 'Cannot modify admin users' });
    }

    await ctx.orm
      .update(userTable)
      .set({ role: input.role.toLowerCase() })
      .where(eq(userTable.id, targetUser.id));
    return true;
  });
```

### Grant Admin by Email

```ts
export const grantAdminByEmail = authMutation
  .meta({ role: 'admin' })
  .input(z.object({ email: z.string().email(), role: z.enum(['admin']) }))
  .output(z.object({ success: z.boolean(), userId: z.string().optional() }))
  .mutation(async ({ ctx, input }) => {
    const user = await ctx.orm.query.user.findFirst({ where: { email: input.email } });
    if (!user) return { success: false };

    await ctx.orm
      .update(userTable)
      .set({ role: input.role.toLowerCase() })
      .where(eq(userTable.id, user.id));
    return { success: true, userId: user.id };
  });
```

### List All Users (Paginated)

```ts
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

export const getAllUsers = authQuery
  .input(z.object({
    role: z.enum(['all', 'user', 'admin']).optional(),
    search: z.string().optional(),
  }))
  .paginated({ limit: 20, item: UserListItemSchema.nullable() })
  .query(async ({ ctx, input }) => {
    const result = await ctx.orm.query.user.findMany({
      cursor: input.cursor,
      limit: input.limit,
    });

    const enrichedPage = result.page
      .map((user) => {
        const userData = {
          ...user,
          banExpiresAt: user?.banExpires,
          banReason: user?.banReason,
          email: user?.email || '',
          isBanned: user?.banned,
          role: user?.role || 'user',
        };

        if (input.search) {
          const searchLower = input.search.toLowerCase();
          if (!(userData.name?.toLowerCase().includes(searchLower) || userData.email.toLowerCase().includes(searchLower))) {
            return null;
          }
        }
        if (input.role && input.role !== 'all' && userData.role !== input.role) return null;

        return userData;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return { ...result, page: enrichedPage };
  });
```

### Dashboard Stats

```ts
export const getDashboardStats = authQuery
  .meta({ role: 'admin' })
  .output(z.object({
    recentUsers: z.array(z.object({ id: z.string(), createdAt: z.date(), image: z.string().nullish(), name: z.string().optional() })),
    totalAdmins: z.number(),
    totalUsers: z.number(),
    userGrowth: z.array(z.object({ count: z.number(), date: z.string() })),
  }))
  .query(async ({ ctx }) => {
    const toRows = <TRow>(result: TRow[] | { page: TRow[] }): TRow[] =>
      Array.isArray(result) ? result : result.page;

    const recentUsers = toRows(await ctx.orm.query.user.findMany({
      limit: 5, orderBy: { createdAt: 'desc' },
      columns: { id: true, createdAt: true, image: true, name: true },
    }));

    const usersLast7Days = toRows(await ctx.orm.query.user.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      limit: 1000,
    }));

    const userGrowth: { count: number; date: string }[] = [];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - i * oneDay);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0)).getTime();
      const endOfDay = new Date(date.setHours(23, 59, 59, 999)).getTime();
      userGrowth.push({
        count: usersLast7Days.filter((u) => {
          const t = u.createdAt.getTime();
          return t >= startOfDay && t <= endOfDay;
        }).length,
        date: new Date(startOfDay).toISOString().split('T')[0],
      });
    }

    const sampleUsers = toRows(await ctx.orm.query.user.findMany({ limit: 100 }));
    const adminCount = sampleUsers.filter((u) => u.role === 'admin').length;
    const totalUsers = await ctx.orm.query.user.count();
    const totalAdmins = Math.round((adminCount / sampleUsers.length) * totalUsers);

    return { recentUsers, totalAdmins, totalUsers, userGrowth };
  });
```

## Client Usage

### Check Admin Status

```ts
const { data: session } = authClient.useSession();
const isAdmin = session?.user?.role === 'admin';
```

### Ban/Unban Users

```ts
await authClient.admin.banUser({
  userId: 'user_123',
  banReason: 'Violation of terms',
  banExpiresIn: 60 * 60 * 24 * 7, // 7 days
});

await authClient.admin.unbanUser({ userId: 'user_123' });
```

### Session Management

```ts
const { data: sessions } = await authClient.admin.listUserSessions({ userId: 'user_123' });
await authClient.admin.revokeUserSession({ sessionToken: 'session_token' });
await authClient.admin.revokeUserSessions({ userId: 'user_123' }); // All sessions
```

### Impersonation

```ts
await authClient.admin.impersonateUser({ userId: 'user_123' });
await authClient.admin.stopImpersonating();
```

### User Management

```ts
// Create user
await authClient.admin.createUser({
  email: 'user@domain.test', password: 'password', name: 'John Doe', role: 'user',
});

// List users (with filtering/sorting/pagination)
const { users, total } = await authClient.admin.listUsers({
  searchValue: 'john', searchField: 'name', limit: 20, offset: 0,
  sortBy: 'createdAt', sortDirection: 'desc',
});

// Set role
await authClient.admin.setRole({ userId, role: 'admin' });

// Set password
await authClient.admin.setUserPassword({ userId, newPassword });

// Update user
await authClient.admin.updateUser({ userId, data: { name: 'New Name' } });

// Delete user
await authClient.admin.removeUser({ userId });
```

### Permission Checking

```ts
// Server call
const { success } = await authClient.admin.hasPermission({
  permissions: { project: ['create', 'update'] },
});

// Client-side, no server call
const canDelete = authClient.admin.checkRolePermission({
  role: 'admin',
  permissions: { project: ['delete'] },
});
```

## API Reference

| Operation | Method | Admin Required |
|-----------|--------|----------------|
| Create user | `authClient.admin.createUser` | Yes |
| List users | `authClient.admin.listUsers` | Yes |
| Set role | `authClient.admin.setRole` | Yes |
| Set password | `authClient.admin.setUserPassword` | Yes |
| Update user | `authClient.admin.updateUser` | Yes |
| Ban user | `authClient.admin.banUser` | Yes |
| Unban user | `authClient.admin.unbanUser` | Yes |
| List sessions | `authClient.admin.listUserSessions` | Yes |
| Revoke session | `authClient.admin.revokeUserSession` | Yes |
| Revoke all sessions | `authClient.admin.revokeUserSessions` | Yes |
| Impersonate | `authClient.admin.impersonateUser` | Yes |
| Stop impersonating | `authClient.admin.stopImpersonating` | Yes |
| Remove user | `authClient.admin.removeUser` | Yes |
| Check permission | `authClient.admin.hasPermission` | No |
| Check role permission | `authClient.admin.checkRolePermission` | No |

Use Convex functions for custom admin operations. Use Better Auth client API for standard operations like user management, banning, and session management.
