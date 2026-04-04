# Auth Core Reference

> Prerequisites: `setup/auth.md`

Covers Better Auth integration with Convex: server setup, client hooks, triggers, and auth flow. Assumes Better Auth baseline knowledge.

## Key Concepts

**Local approach** — auth tables live in your app schema (not a component). Triggers directly access app tables via `ctx.orm`. Single transaction.

**Context-aware adapter** — generated `getAuth(ctx)` auto-selects:

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

Below is the reference for auth patterns.

### 1. Install auth with CLI

Use the CLI-first path:

```bash
npx kitcn add auth --yes
```

If kitcn is not bootstrapped yet, start with `npx kitcn@latest init -t next --yes` for a fresh app or `npx kitcn@latest init --yes` for in-place adoption.

On local Convex, `add auth --yes` also finishes the first auth bootstrap pass: generated runtime, `BETTER_AUTH_SECRET`, and `JWKS`.

### 2. Auth Config

```ts
// convex/functions/auth.config.ts
import { getAuthConfigProvider } from 'kitcn/auth/config';
import { getEnv } from '../lib/get-env';

export default {
  providers: [
    getEnv().JWKS
      ? getAuthConfigProvider({ jwks: getEnv().JWKS })
      : getAuthConfigProvider(),
  ],
} satisfies AuthConfig;
```

### 3. Generate Runtime

Start `kitcn dev` for the long-running local runtime. It runs Convex,
watches for changes, and regenerates runtime files automatically:

```bash
npx kitcn dev
```

### 4. Define Auth Contract

The auth definition lives at `<functionsDir>/auth.ts`. `functionsDir` comes
from `convex.json.functions` (default: `convex`), so scaffolded kitcn
apps use `convex/functions/auth.ts`.

```ts
// convex/functions/auth.ts
import { convex } from 'kitcn/auth';
import { getEnv } from '../lib/get-env';
import authConfig from './auth.config';
import { defineAuth } from './generated/auth';

export default defineAuth(() => ({
  emailAndPassword: {
    enabled: true,
  },
  baseURL: getEnv().SITE_URL,
  plugins: [
    convex({
      authConfig,
      jwks: getEnv().JWKS,
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 15,
  },
  telemetry: { enabled: false },
  trustedOrigins: [getEnv().SITE_URL],
}));
```

Use runtime exports (`getAuth`, CRUD/JWKS handlers, trigger handlers, static `auth`) from `<functionsDir>/generated/auth`.

### 5. Schema (ORM API)

Default kitcn path:

```bash
npx kitcn add auth --yes
npx kitcn add auth --schema --yes
```

That path patches auth-owned table blocks directly into `<functionsDir>/schema.ts`
and records ownership in `<functionsDir>/plugins.lock.json`.

Raw Convex path:

```bash
npx kitcn add auth --preset convex --yes
```

That path refreshes `<functionsDir>/authSchema.ts` and patches
`<functionsDir>/schema.ts`. It assumes the raw Convex app is already
initialized and does not support `--schema`.

If you want to own the auth tables by hand, use `setup/server.md`.

### 6. Auth HTTP Runtime

Import auth route helpers from `kitcn/auth/http`.
That entrypoint auto-installs the Convex-safe `MessageChannel` polyfill.

### 7. HTTP Routes

Three options — cRPC (recommended), plain Convex, or Hono:

```ts
// convex/functions/http.ts — cRPC option
import { authMiddleware } from 'kitcn/auth/http';
import { createHttpRouter } from 'kitcn/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getEnv } from '../lib/get-env';
import { getAuth } from './generated/auth';

const app = new Hono();
app.use('/api/*', cors({
  origin: getEnv().SITE_URL,
  allowHeaders: ['Content-Type', 'Authorization', 'Better-Auth-Cookie'],
  exposeHeaders: ['Set-Better-Auth-Cookie'],
  credentials: true,
}));
app.use(authMiddleware(getAuth));
export default createHttpRouter(app, httpRouter);
```

### 8. Environment Variables

```bash
# convex/.env
SITE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Auto-generated during local auth bootstrap and prod env push
BETTER_AUTH_SECRET=...
JWKS=...
```

Local Convex:
1. `init --yes`, `dev`, and `add auth --yes` drive the first auth bootstrap when they own the flow.
2. While `kitcn dev` is running on backend `convex`, later edits to `convex/.env` auto-sync.
3. For the normal local path, `SITE_URL` should stay on `http://localhost:3000`.

Remote / repair:
1. Use `npx kitcn env push` when the target deployment is already active.
2. Use `npx kitcn env push --prod` for production sync.

Key rotation: `npx kitcn env push --rotate` (invalidates all tokens).

---

## Server Helpers

```ts
import { getAuthUserIdentity, getAuthUserId, getSession, getHeaders } from 'kitcn/auth';
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
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';
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

Rule:

1. The standard Next local path assumes `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
2. If the app runs on another port, update `.env.local` `NEXT_PUBLIC_SITE_URL`,
   `convex/.env` `SITE_URL`, and the app dev script together.

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

All from `kitcn/react`:

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

All from `kitcn/react`:

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
import { ConvexProviderWithAuth } from 'kitcn/react';
<ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
```

---

## Auth Triggers

Define triggers in `auth.ts` via `defineAuth(() => ({ triggers }))`. Triggers run inline in the same CRUD transaction.

### Trigger Shape

Nested `{ create, update, delete, change }` per table, matching ORM `defineTriggers` pattern. See [Trigger Shape reference](#trigger-shape-1) below for callback signatures.

`before` return contract: `void` (continue unchanged), `{ data }` (shallow merge into payload), `false` (cancel write).

`change` receives `{ operation: 'insert' | 'update' | 'delete', id, newDoc, oldDoc }`.

```ts
triggers: {
  user: {
    create: {
      before: async (data, triggerCtx) => {
        const username = await generateUniqueUsername(triggerCtx, data.name);
        const role = adminEmails.includes(data.email) ? 'admin' : 'user';
        return { data: { ...data, username, role } };
      },
      after: async (user, triggerCtx) => {
        await triggerCtx.orm.insert(profiles).values({ userId: user.id, bio: '' });
        const emailCaller = createEmailsCaller(triggerCtx);
        await emailCaller.schedule.now.sendWelcome({ userId: user.id });
      },
    },
    update: {
      after: async (newDoc, triggerCtx) => {
        // Use `change` handler for old vs new comparisons
      },
    },
    delete: {
      after: async (user, triggerCtx) => {
        const profiles = await triggerCtx.orm.query.profiles.findMany({ where: { userId: user.id }, limit: 1000 });
        for (const p of profiles) await triggerCtx.orm.delete(profilesTable).where(eq(profilesTable.id, p.id));
      },
    },
    change: async (change, triggerCtx) => {
      switch (change.operation) {
        case 'update':
          if (change.newDoc.image !== change.oldDoc.image) {
            const profile = await triggerCtx.orm.query.profiles.findFirst({ where: { userId: change.id } });
            if (profile) await triggerCtx.orm.update(profiles).set({ avatar: change.newDoc.image }).where(eq(profiles.id, profile.id));
          }
          break;
      }
    },
  },
}
```

### Session Triggers

```ts
triggers: {
  session: {
    create: {
      after: async (session, triggerCtx) => {
        if (!session.activeOrganizationId) {
          const user = await triggerCtx.orm.query.user.findFirst({ where: { id: session.userId } });
          if (user?.lastActiveOrganizationId) {
            await triggerCtx.orm.update(sessionTable).set({ activeOrganizationId: user.lastActiveOrganizationId })
              .where(eq(sessionTable.id, session.id));
          }
        }
      },
    },
  },
}
```

### Type Safety

Triggers are typed from schema: `data` is `Infer<Schema['tables']['user']['validator']>`, `doc` includes `id` and `_creationTime`, `update` is `Partial`.

---

## Auth vs DB Triggers

Auth triggers (`defineAuth(...).triggers`) handle auth lifecycle events. DB triggers (`defineTriggers`) handle database-level side effects (aggregates, cascades, counters).

---

## API Reference

### Trigger Shape

Nested `{ create, update, delete, change }` per table, matching ORM `defineTriggers` pattern:

| Hook | Signature | Return |
|------|-----------|--------|
| `create.before` | `(data, ctx) => void \| { data } \| false` | Merge / cancel |
| `create.after` | `(doc, ctx) => void` | Side effects |
| `update.before` | `(update, ctx) => void \| { data } \| false` | Merge / cancel |
| `update.after` | `(newDoc, ctx) => void` | Sync changes |
| `delete.before` | `(doc, ctx) => void \| { data } \| false` | Guard / cancel |
| `delete.after` | `(doc, ctx) => void` | Cleanup |
| `change` | `(change, ctx) => void` | Cross-operation |
