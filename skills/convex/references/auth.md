# Auth Core Reference

Covers Better Auth integration with Convex: server setup, client hooks, triggers, and auth flow. Assumes Better Auth baseline knowledge.

## Key Concepts

**Local approach** — auth tables live in your app schema (not a component). Triggers directly access app tables via `ctx.orm`. Single transaction.

**Context-aware adapter** — `authClient.adapter(ctx, getAuthOptions)` auto-selects:

| Context | Adapter | Behavior |
|---------|---------|----------|
| Query/Mutation (`ctx.db`) | Direct DB | No `runQuery`/`runMutation` wrapper |
| Action/HTTP | HTTP adapter | Uses `ctx.run*` APIs |

**Entrypoint**: `getAuth(ctx)` everywhere (query, mutation, action, HTTP).

## Auth Flow

Two-step validation for every request (SSR or WebSocket):

1. **JWT validation** (cryptographic) — decode, verify signature via JWKS, check `exp`
2. **Session lookup** (database) — `session.id = sessionId AND expiresAt > now`

JWT validity doesn't guarantee access. Session lookup is the source of truth — deleting the session immediately invalidates access.

| Component | Storage | Invalidatable | Default Lifetime |
|-----------|---------|---------------|------------------|
| JWT | Cookie (signed) | No (stateless) | 15 min |
| Session | Convex DB | Yes (stateful) | 30 days |

### SSR vs Client

| | SSR (HTTP) | Client (WebSocket) |
|---|---|---|
| Transport | HTTP per query | Persistent connection |
| Token source | Cookie / fetch from `/api/auth/convex/token` | WebSocket handshake |
| Validation | Per request | Once at connection, then cached |
| JWKS impact | +100-400ms per request (if dynamic) | +100-400ms blocking handshake (if dynamic) |

**Static JWKS** (recommended): instant validation. **Dynamic JWKS**: +100-400ms network calls.

### Auth States

| Scenario | JWT | Session | Result |
|----------|-----|---------|--------|
| Normal | Valid | Valid | 200 OK |
| Sign out | Deleted | Deleted | 401 |
| Admin revokes session | Valid | Deleted | 401 on next request |
| JWT expired, session valid | Expired | Valid | Auto-refresh → 200 |
| JWT expired, session expired | Expired | Expired | 401 |
| User banned | Valid | Valid (banned) | 403 |

Client auto-refreshes expired JWTs with 60s leeway.

---

## Server Setup

### 1. Auth Config

```ts
// convex/functions/auth.config.ts
import { getAuthConfigProvider } from 'better-convex/auth-config';
export default {
  providers: [getAuthConfigProvider({ jwks: process.env.JWKS })],
} satisfies AuthConfig;
```

### 2. Create Auth Client

```ts
// convex/functions/auth.ts
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { convex, createClient, createApi, type AuthFunctions } from 'better-convex/auth';
import { internal } from './_generated/api';
import schema from './schema';
import authConfig from './auth.config';
import { withOrm } from '../lib/orm';

type GenericCtx = QueryCtx | MutationCtx | ActionCtx;
const authFunctions: AuthFunctions = internal.auth;

// Client with triggers
export const authClient = createClient<DataModel, typeof schema>({
  authFunctions,
  schema,
  context: withOrm, // enrich auth mutation + trigger ctx with ctx.orm
  triggers: {
    user: {
      beforeCreate: async (_ctx, data) => {
        const username = data.username?.trim() || data.email?.split('@')[0] || `user-${Date.now()}`;
        return { ...data, username };
      },
      onCreate: async (ctx, user) => {
        await ctx.orm.insert(profiles).values({ userId: user.id, bio: '' });
      },
    },
  },
});

// Auth options factory
export const getAuthOptions = (ctx: GenericCtx) => ({
  baseURL: process.env.SITE_URL!,
  database: authClient.adapter(ctx, getAuthOptions),
  plugins: [
    convex({ authConfig, jwks: process.env.JWKS }),
    admin(),
  ],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 * 15 },
  socialProviders: {
    google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
  },
  trustedOrigins: [process.env.SITE_URL ?? 'http://localhost:3000'],
}) satisfies BetterAuthOptions;

// Auth instance for all contexts
export const getAuth = (ctx: GenericCtx) => betterAuth(getAuthOptions(ctx));

// Export triggers for Better Auth adapter
export const { beforeCreate, beforeDelete, beforeUpdate, onCreate, onDelete, onUpdate } =
  authClient.triggersApi();

// Export CRUD + key functions
export const { create, deleteMany, deleteOne, findMany, findOne, updateMany, updateOne, getLatestJwks, rotateKeys } =
  createApi(schema, getAuth, { context: withOrm, skipValidation: true });

// For Better Auth CLI
export const auth = betterAuth(getAuthOptions({} as any));
```

### 3. Schema (ORM API)

Generate with CLI or define manually:

```bash
npx @better-auth/cli generate -y --output convex/functions/authSchema.ts --config convex/functions/auth.ts
```

Manual template:
```ts
import { boolean, convexTable, defineSchema, id, index, integer, text, timestamp } from 'better-convex/orm';

export const user = convexTable('user', {
  name: text().notNull(),
  email: text().notNull(),
  emailVerified: boolean().notNull(),
  image: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: integer().notNull(),
  role: text(),                  // admin plugin
  banned: boolean(),             // admin plugin
  banReason: text(),
  banExpires: integer(),
}, (t) => [index('email').on(t.email)]);

export const session = convexTable('session', {
  token: text().notNull(),
  expiresAt: integer().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: integer().notNull(),
  ipAddress: text(),
  userAgent: text(),
  userId: id('user').notNull(),
  impersonatedBy: text(),        // admin plugin
}, (t) => [index('token').on(t.token), index('userId').on(t.userId)]);

export const account = convexTable('account', {
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: id('user').notNull(),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: integer(),
  refreshTokenExpiresAt: integer(),
  scope: text(),
  password: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: integer().notNull(),
}, (t) => [index('accountId').on(t.accountId), index('userId').on(t.userId)]);

export const verification = convexTable('verification', {
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: integer().notNull(),
  createdAt: timestamp(),
  updatedAt: integer(),
}, (t) => [index('identifier').on(t.identifier)]);

export const jwks = convexTable('jwks', {
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
```

### 4. Polyfills (Required)

```ts
// convex/lib/http-polyfills.ts — import at top of http.ts before other imports
if (typeof MessageChannel === 'undefined') {
  class MockMessagePort {
    onmessage; onmessageerror;
    addEventListener() {} close() {} dispatchEvent() { return false; }
    postMessage() {} removeEventListener() {} start() {}
  }
  class MockMessageChannel {
    port1 = new MockMessagePort(); port2 = new MockMessagePort();
  }
  globalThis.MessageChannel = MockMessageChannel as unknown as typeof MessageChannel;
}
```

### 5. HTTP Routes

Three options — cRPC (recommended), plain Convex, or Hono:

```ts
// convex/functions/http.ts — cRPC option
import '../lib/http-polyfills';
import { authMiddleware } from 'better-convex/auth';
import { createHttpRouter } from 'better-convex/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAuth } from './auth';

const app = new Hono();
app.use('/api/*', cors({
  origin: process.env.SITE_URL!,
  allowHeaders: ['Content-Type', 'Authorization', 'Better-Auth-Cookie'],
  exposeHeaders: ['Set-Better-Auth-Cookie'],
  credentials: true,
}));
app.use(authMiddleware(getAuth));
export default createHttpRouter(app, httpRouter);
```

### 6. Environment Variables

```bash
# convex/.env
SITE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Auto-generated by: npx better-convex env sync --auth
BETTER_AUTH_SECRET=...
JWKS=...
```

`npx better-convex env sync --auth` behavior:
1. Syncs `convex/.env` values into the active deployment.
2. Auto-generates `BETTER_AUTH_SECRET` + `JWKS` when missing.

Prerequisite:
1. Run `npx better-convex dev` (or `npx convex dev`) first so deployment connection is active.
2. If no deployment is active, sync may run against anonymous context and fail to write env vars.

Key rotation: `npx convex run auth:rotateKeys | npx convex env set JWKS` (invalidates all tokens).

---

## Server Helpers

```ts
import { getAuthUserIdentity, getAuthUserId, getSession, getHeaders } from 'better-convex/auth';
```

| Helper | Returns | Use case |
|--------|---------|----------|
| `getAuthUserIdentity(ctx)` | `{ userId, sessionId, subject }` or null | Full identity |
| `getAuthUserId(ctx)` | `Id<'user'>` or null | Just user ID |
| `getSession(ctx)` | `{ id, userId, activeOrganizationId, expiresAt }` or null | Session doc |
| `getHeaders(ctx)` | `Headers` with Authorization + x-forwarded-for | Forward to external APIs |

```ts
// Common pattern
const userId = await getAuthUserId(ctx);
if (!userId) throw new CRPCError({ code: 'UNAUTHORIZED' });
const user = await ctx.orm.query.user.findFirst({ where: { id: userId } });
```

### Convex Plugin Options

```ts
convex({
  authConfig,              // required
  jwks: process.env.JWKS,  // static JWKS for fast validation
  jwt: {
    expirationSeconds: 60 * 60 * 4, // default 15 min
    definePayload: ({ user, session }) => ({
      name: user.name, email: user.email, role: user.role,
      sessionId: session.id, // always added automatically
    }),
  },
  options: { basePath: '/custom/auth/path' }, // if non-default
})
```

Default `definePayload` includes all user fields except `id` and `image`, plus `sessionId` and `iat`.

---

## Client Setup

### Auth Client

```ts
// src/lib/convex/auth-client.ts
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'better-convex/auth-client';
import { createAuthMutations } from 'better-convex/react';
import type { Auth } from '@convex/auth-shared';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [inferAdditionalFields<Auth>(), convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignInSocialMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
```

### Sign In

**Social:**
```ts
const signInSocial = useMutation(useSignInSocialMutationOptions());
signInSocial.mutate({ callbackURL: window.location.origin, provider: 'google' });
```

**Email/password** (requires `emailAndPassword: { enabled: true }` in server config):
```ts
const signIn = useMutation(useSignInMutationOptions({ onSuccess: () => router.push('/') }));
signIn.mutate({ callbackURL: window.location.origin, email, password });

const signUp = useMutation(useSignUpMutationOptions({ onSuccess: () => router.push('/') }));
signUp.mutate({ callbackURL: window.location.origin, email, name, password });
```

### Sign Out

```ts
const signOut = useMutation(useSignOutMutationOptions({
  onSuccess: () => router.push('/login'),
}));
signOut.mutate();
```

`useSignOutMutationOptions` auto-calls `unsubscribeAuthQueries()` before signOut to prevent UNAUTHORIZED errors. `isPending` stays true until token actually cleared.

---

## Client Hooks

All from `better-convex/react`:

| Hook | Returns | Description |
|------|---------|-------------|
| `useAuth()` | `{ hasSession, isAuthenticated, isLoading }` | Full auth state |
| `useMaybeAuth()` | `boolean` | Has token (optimistic, may not be verified) |
| `useIsAuth()` | `boolean` | Server-verified authentication |
| `useAuthGuard()` | `() => boolean` | Guard mutations, returns true if blocked |

### useAuthGuard

```ts
const guard = useAuthGuard();
const handleClick = () => {
  if (guard()) return; // blocked — not authenticated
  createPost.mutate({ title: 'New Post' });
};

// Or with callback — only runs if authenticated:
guard(async () => {
  await createPost.mutateAsync({ title: 'New Post' });
});
```

## Conditional Rendering

All from `better-convex/react`:

| Component | Renders when |
|-----------|-------------|
| `MaybeAuthenticated` | Has session token (optimistic) |
| `Authenticated` | Server-verified authenticated |
| `MaybeUnauthenticated` | No session token (optimistic) |
| `Unauthenticated` | Server-verified not authenticated |

```tsx
<MaybeAuthenticated><Dashboard /></MaybeAuthenticated>
<MaybeUnauthenticated><LoginPage /></MaybeUnauthenticated>
```

## Provider Config

```tsx
<ConvexAuthProvider
  client={convex}
  authClient={authClient}
  initialToken={token}           // from SSR (caller.getToken())
  onMutationUnauthorized={() => router.push('/login')}
  onQueryUnauthorized={({ queryName }) => console.log(`Unauth: ${queryName}`)}
>
```

For `@convex-dev/auth` (React Native):
```tsx
import { ConvexProviderWithAuth } from 'better-convex/react';
<ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
```

---

## Auth Triggers

Pass to `createClient({ triggers })`. Before triggers run in same transaction. After triggers run post-write.

### User Triggers

| Trigger | Signature | Return |
|---------|-----------|--------|
| `beforeCreate` | `(ctx, data) => data \| undefined` | Modified data |
| `onCreate` | `(ctx, doc) => void` | Side effects |
| `beforeUpdate` | `(ctx, doc, update) => update \| undefined` | Modified update |
| `onUpdate` | `(ctx, newDoc, oldDoc) => void` | Sync changes |
| `beforeDelete` | `(ctx, doc) => doc \| undefined` | Modified doc |
| `onDelete` | `(ctx, doc) => void` | Cleanup |

```ts
triggers: {
  user: {
    beforeCreate: async (ctx, data) => {
      const username = await generateUniqueUsername(ctx, data.name);
      const role = adminEmails.includes(data.email) ? 'admin' : 'user';
      return { ...data, username, role };
    },
    onCreate: async (ctx, user) => {
      await ctx.orm.insert(profiles).values({ userId: user.id, bio: '' });
      await ctx.scheduler.runAfter(0, internal.emails.sendWelcome, { userId: user.id });
    },
    onUpdate: async (ctx, newDoc, oldDoc) => {
      if (newDoc.image !== oldDoc.image) {
        const profile = await ctx.orm.query.profiles.findFirst({ where: { userId: newDoc.id } });
        if (profile) await ctx.orm.update(profiles).set({ avatar: newDoc.image }).where(eq(profiles.id, profile.id));
      }
    },
    onDelete: async (ctx, user) => {
      const profiles = await ctx.orm.query.profiles.findMany({ where: { userId: user.id }, limit: 1000 });
      for (const p of profiles) await ctx.orm.delete(profilesTable).where(eq(profilesTable.id, p.id));
    },
  },
}
```

### Session Triggers

```ts
triggers: {
  session: {
    onCreate: async (ctx, session) => {
      if (!session.activeOrganizationId) {
        const user = await ctx.orm.query.user.findFirst({ where: { id: session.userId } });
        if (user?.lastActiveOrganizationId) {
          await ctx.orm.update(sessionTable).set({ activeOrganizationId: user.lastActiveOrganizationId })
            .where(eq(sessionTable.id, session.id));
        }
      }
    },
  },
}
```

### Export Trigger Functions

```ts
export const { beforeCreate, beforeDelete, beforeUpdate, onCreate, onDelete, onUpdate } =
  authClient.triggersApi();
```

### Type Safety

Triggers are typed from schema: `data` is `Infer<Schema['tables']['user']['validator']>`, `doc` includes `id` and `_creationTime`, `update` is `Partial`.

---

## Auth vs DB Triggers

Auth triggers (`createClient({ triggers })`) handle auth lifecycle events. DB triggers (`convexTable('user', {...}, () => [...])`) handle database-level side effects (aggregates, cascades, counters). Use `context: withOrm` so both can access `ctx.orm`.
