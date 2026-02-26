# React & RSC Reference

> Prerequisites: `setup/react.md`, `setup/next.md`

Covers all better-convex React client, TanStack Query integration, and Next.js RSC patterns. Assumes TanStack Query baseline knowledge.

## Setup

### createCRPCContext

```ts
// src/lib/convex/crpc.tsx
import { api } from '@convex/api';
import { createCRPCContext } from 'better-convex/react';

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
  transformer, // optional — Date always enabled ($date wire tag). Use createTaggedTransformer for extra codecs.
});
```

| Export | Description |
|--------|-------------|
| `CRPCProvider` | Context provider — wraps children with cRPC proxy |
| `useCRPC` | Hook → cRPC proxy for `queryOptions`/`mutationOptions`/`infiniteQueryOptions` |
| `useCRPCClient` | Hook → typed vanilla client for imperative `client.path.query()`/`mutate()` |

### QueryClient

cRPC auto-sets `staleTime: Infinity`, `refetch*: false` per query (Convex pushes via WebSocket — never stale).

```ts
// src/lib/convex/query-client.ts
import { defaultShouldDehydrateQuery, QueryCache, QueryClient } from '@tanstack/react-query';
import { isCRPCClientError, isCRPCError } from 'better-convex/crpc';
import SuperJSON from 'superjson';

// Shared hydration config for SSR (client + server)
export const hydrationConfig = {
  dehydrate: {
    serializeData: SuperJSON.serialize,
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
    shouldRedactErrors: () => false,
  },
  hydrate: { deserializeData: SuperJSON.deserialize },
};

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isCRPCClientError(error)) {
          console.log(`[CRPC] ${error.code}:`, error.functionName);
        }
      },
    }),
    defaultOptions: {
      ...hydrationConfig,
      mutations: {
        onError: (err) => {
          const error = err as Error & { data?: { message?: string } };
          toast.error(error.data?.message || error.message);
        },
      },
      queries: {
        retry: (failureCount, error) => {
          if (isCRPCError(error)) return false; // don't retry deterministic errors
          return failureCount < 3;
        },
        retryDelay: (i) => Math.min(2000 * 2 ** i, 30_000),
      },
    },
  });
}
```

### Provider Hierarchy

**Without auth:**
```tsx
// src/lib/convex/convex-provider.tsx
'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConvexProvider, ConvexReactClient, getQueryClientSingleton, getConvexQueryClientSingleton } from 'better-convex/react';
import { CRPCProvider } from '@/lib/convex/crpc';
import { createQueryClient } from '@/lib/convex/query-client';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function BetterConvexProvider({ children }) {
  return (
    <ConvexProvider client={convex}>
      <QueryProvider>{children}</QueryProvider>
    </ConvexProvider>
  );
}

function QueryProvider({ children }) {
  const queryClient = getQueryClientSingleton(createQueryClient);
  const convexQueryClient = getConvexQueryClientSingleton({ convex, queryClient });
  return (
    <QueryClientProvider client={queryClient}>
      <CRPCProvider convexClient={convex} convexQueryClient={convexQueryClient}>
        {children}
      </CRPCProvider>
    </QueryClientProvider>
  );
}
```

**With auth** — swap `ConvexProvider` for `ConvexAuthProvider`:
```tsx
import { ConvexAuthProvider } from 'better-convex/auth/client';
import { ConvexReactClient, getConvexQueryClientSingleton, getQueryClientSingleton, useAuthStore } from 'better-convex/react';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function BetterConvexProvider({ children, token }: { children: ReactNode; token?: string }) {
  const router = useRouter();
  return (
    <ConvexAuthProvider
      authClient={authClient}
      client={convex}
      initialToken={token}
      onMutationUnauthorized={() => router.push('/login')}
      onQueryUnauthorized={() => router.push('/login')}
    >
      <QueryProvider>{children}</QueryProvider>
    </ConvexAuthProvider>
  );
}

function QueryProvider({ children }) {
  const authStore = useAuthStore(); // pass to singleton
  const queryClient = getQueryClientSingleton(createQueryClient);
  const convexQueryClient = getConvexQueryClientSingleton({ authStore, convex, queryClient });
  return (
    <QueryClientProvider client={queryClient}>
      <CRPCProvider convexClient={convex} convexQueryClient={convexQueryClient}>
        {children}
      </CRPCProvider>
    </QueryClientProvider>
  );
}
```

### Singleton Helpers

| Helper | Behavior |
|--------|----------|
| `getQueryClientSingleton(factory)` | Same instance on client, fresh per SSR request |
| `getConvexQueryClientSingleton(opts)` | Creates/connects ConvexQueryClient bridge |

`getConvexQueryClientSingleton` options:
- `convex` — ConvexReactClient
- `queryClient` — TanStack QueryClient
- `authStore` — from `useAuthStore()` (auth apps only)
- `unsubscribeDelay` — ms before unsubscribing after unmount (default 3000). Covers StrictMode + quick back-nav.

### ConvexQueryClient (Bridge)

Bridges WebSocket subscriptions → TanStack Query cache. Push model (not pull):

```
useQuery() → WebSocket subscription → real-time updates → cache always fresh
```

Defaults: `staleTime: Infinity`, `gcTime: 5min`, `refetchOnMount: false`, `refetchOnWindowFocus: false`.

Lifecycle: Mount → subscribe → unmount → wait `unsubscribeDelay` → unsubscribe (cache persists for `gcTime`).

---

## Queries

### queryOptions

```ts
const crpc = useCRPC();
const { data } = useQuery(crpc.user.list.queryOptions({}));
const { data } = useQuery(crpc.user.get.queryOptions({ id }));
const { data } = useQuery(crpc.user.get.queryOptions({ id }, { enabled: !!id, placeholderData: null }));
```

Signature: `crpc.path.queryOptions(args, options?)`

cRPC-specific options beyond standard TanStack Query:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skipUnauth` | `boolean` | `false` | Skip query when not authenticated (returns undefined) |
| `subscribe` | `boolean` | `true` | Enable real-time WebSocket subscription |

**With `select`** — spread options, add select separately:
```ts
const { data } = useSuspenseQuery({
  ...crpc.http.health.queryOptions(),
  select: (data) => data.status, // data: string
});
```

### Real-time Subscriptions

Default ON. Every `queryOptions` subscribes to Convex WebSocket. Disable with `subscribe: false`:
```ts
useQuery(crpc.analytics.getReport.queryOptions({ period }, { subscribe: false }));
// refresh manually:
queryClient.invalidateQueries(crpc.analytics.getReport.queryFilter());
```

### Auth-Aware Queries

**`skipUnauth`** — client-side: returns undefined when not authenticated:
```ts
useQuery(crpc.user.getCurrentUser.queryOptions({}, { skipUnauth: true }));
```

**`meta({ auth })` on procedures** — controls query behavior during auth loading:

| Procedure type | Auth loading | Logged out |
|----------------|-------------|------------|
| `publicQuery` | Runs immediately | Runs |
| `optionalAuthQuery` (auth: 'optional') | **Waits** | Runs |
| `authQuery` (auth: 'required') | **Waits** | **Skips** |

The procedure builders (`authQuery`, `publicQuery`, etc.) already include correct `.meta()` settings.

### Conditional Queries

```ts
// enabled
useQuery(crpc.user.getSettings.queryOptions({ userId: user?.id }, { enabled: !!user }));

// skipToken
import { skipToken } from '@tanstack/react-query';
useQuery(crpc.user.get.queryOptions(userId ? { id: userId } : skipToken));
```

### Query Keys & Filters

```ts
const queryKey = crpc.user.list.queryKey({}); // ['convexQuery', 'user:list', {}]
const data = queryClient.getQueryData(queryKey);

const filter = crpc.user.list.queryFilter({}, { predicate: (q) => q.state.dataUpdatedAt > Date.now() - 60000 });
queryClient.invalidateQueries(filter);
```

### Imperative Calls

Three methods:

| Method | Context | Caching | Use Case |
|--------|---------|---------|----------|
| `client.*.query()` | Anywhere | None | Direct calls, no cache |
| `crpc.*.queryOptions()` | Render only | Cache | Components (uses hooks) |
| `crpc.*.staticQueryOptions()` | Anywhere | Cache | Prefetch, event handlers |

```ts
// useCRPCClient — direct calls
const client = useCRPCClient();
const user = await client.user.get.query({ id });
await client.user.update.mutate({ id, name: 'test' });

// staticQueryOptions — prefetch in event handlers (no hooks, no reactive auth)
const handleMouseEnter = () => {
  queryClient.prefetchQuery(crpc.user.get.staticQueryOptions({ id }));
};
```

### Actions as Queries

Actions (external API calls) auto-detected, no subscription:
```ts
const { data } = useQuery(crpc.ai.analyze.queryOptions({ documentId }));
```

---

## Mutations

### mutationOptions

```ts
const crpc = useCRPC();
const mutation = useMutation(crpc.user.create.mutationOptions());
const mutation = useMutation(crpc.user.update.mutationOptions({
  onSuccess: (data) => toast.success('Updated'),
  onError: (error) => toast.error(error.data?.message ?? 'Failed'),
}));
```

Signature: `crpc.path.mutationOptions(options?)` — standard TanStack mutation options except `mutationFn`.

### Mutation Keys

```ts
const key = crpc.user.create.mutationKey(); // ['convexMutation', 'user:create']
```

### Common Patterns

**Toast promise:**
```ts
toast.promise(mutation.mutateAsync({ title }), {
  loading: 'Creating...', success: 'Created!',
  error: (e) => e.data?.message ?? 'Failed',
});
```

**Form with cleanup:**
```ts
const mutation = useMutation(crpc.user.update.mutationOptions({
  onSuccess: () => { form.reset(); closeModal(); toast.success('Updated'); },
}));
```

**Inline callbacks:**
```ts
mutation.mutate({ id }, {
  onSuccess: () => router.push('/sessions'),
  onError: () => toast.error('Delete failed'),
});
```

### Actions as Mutations

Actions work with `mutationOptions` for external API calls (no real-time):
```ts
const scrape = useMutation(crpc.scraper.scrapeLink.mutationOptions());
```

---

## Infinite Queries

Import `useInfiniteQuery` from `better-convex/react` (wraps TanStack with Convex subscription logic):

```ts
import { useInfiniteQuery } from 'better-convex/react';

const crpc = useCRPC();
const { data, fetchNextPage, hasNextPage, isLoading, status } = useInfiniteQuery(
  crpc.session.list.infiniteQueryOptions({ userId })
);
// data is flattened T[] — all loaded items
// status: 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted'
```

### infiniteQueryOptions

```ts
crpc.path.infiniteQueryOptions(args, options?)
```

| Option | Type | Description |
|--------|------|-------------|
| `limit` | `number` | Items per page (optional if `.paginated(limit)` on server, must be ≤ server limit) |
| `skipUnauth` | `boolean` | Skip when unauthenticated |

Access server limit: `crpc.session.list.meta.limit`

### Backend Setup

```ts
// convex/functions/session.ts
export const list = publicQuery
  .input(z.object({ userId: z.string().optional() }))
  .paginated({ limit: 20, item: SessionSchema })
  .query(async ({ ctx, input }) => {
    // input.cursor and input.limit auto-added
    return ctx.orm.query.session.findMany({
      where: input.userId ? { userId: input.userId } : undefined,
      orderBy: { createdAt: 'desc' },
      cursor: input.cursor,
      limit: input.limit,
    });
    // output auto-wrapped as { continueCursor, isDone, page }
  });
```

`.paginated({ limit, item })`:
- Adds `cursor` (string|null) and `limit` (number) to input
- Auto-sets output schema: `{ continueCursor: string, isDone: boolean, page: T[] }`
- Must be called before `.query()`

### Return Value

See [Infinite Query Return Value](#infinite-query-return-value) in the API Reference below.

### Prefetching

```ts
await queryClient.prefetchQuery(crpc.session.list.infiniteQueryOptions({ userId }));
```

### Placeholder Data

```ts
const { data, isPlaceholderData } = useInfiniteQuery(
  crpc.session.list.infiniteQueryOptions({}, {
    placeholderData: Array.from({ length: crpc.session.list.meta.limit }).map((_, i) => ({
      id: i.toString() as Id<'session'>, token: 'Loading...', expiresAt: 0,
    })),
  })
);
```

### Real-time & Error Recovery

Each page maintains its own WebSocket subscription. Auto-recovers on `InvalidCursor` (resets to page 0) and `splitCursor` (auto-splits page). Pagination state persists in `queryClient` for scroll restoration.

---

## Error Handling

### Server Errors

`CRPCError` thrown server-side → arrives as `ConvexError` on client. Access via `error.data`:

```ts
// Server: throw new CRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
// Client:
const { error, isError } = useQuery(crpc.posts.get.queryOptions({ id }));
if (isError) toast.error(error.data?.message ?? 'Something went wrong');

// Mutation callback:
crpc.posts.create.mutationOptions({ onError: (error) => toast.error(error.data?.message ?? 'Failed') });

// Try/catch:
const error = err as Error & { data?: { message?: string } };
```

### Client Errors

`CRPCClientError` — thrown client-side when queries are skipped (auth):

```ts
import { CRPCClientError, isCRPCClientError, isCRPCErrorCode } from 'better-convex/crpc';

if (isCRPCClientError(error)) {
  error.code;         // 'UNAUTHORIZED'
  error.functionName; // 'user:getSettings'
}
if (isCRPCErrorCode(error, 'UNAUTHORIZED')) router.push('/login');
```

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing authentication |
| `FORBIDDEN` | Not authorized |
| `NOT_FOUND` | Resource not found |
| `BAD_REQUEST` | Invalid input |
| `TOO_MANY_REQUESTS` | Rate limited |

### Global Error Handling

```ts
new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isCRPCClientError(error)) console.log(`[CRPC] ${error.code}:`, error.functionName);
    },
  }),
});
```

---

## Type Inference

```ts
import type { Api, ApiInputs, ApiOutputs } from '@convex/api';
```

Bracket notation:
```ts
type User = ApiOutputs['user']['get'];
type GetUserArgs = ApiInputs['user']['get'];
type OrgMember = ApiOutputs['organization']['members']['list'][number]; // array item
```

---

## Next.js Setup

### Caller Factory

```ts
// src/lib/convex/server.ts
import { api } from '@convex/api';
import { convexBetterAuth } from 'better-convex/auth/nextjs';

export const { createContext, createCaller, handler } = convexBetterAuth({
  api,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
```

| Export | Description |
|--------|-------------|
| `createContext` | RSC context with auth |
| `createCaller` | Server-side caller factory |
| `handler` | Next.js API route handler (`export const { GET, POST } = handler;`) |

Options: `api`, `convexSiteUrl`, `auth.jwtCache` (default true), `auth.isUnauthorized`.

### Client Provider with Auth

```tsx
// layout.tsx
const token = await caller.getToken();
return <ConvexProvider token={token}>{children}</ConvexProvider>;
```

### API Route

```ts
// src/app/api/auth/[...all]/route.ts
import { handler } from '@/lib/convex/server';
export const { GET, POST } = handler;
```

---

## RSC Patterns

### RSC Setup

```tsx
// src/lib/convex/rsc.tsx
import 'server-only';
import { createServerCRPCProxy, getServerQueryClientOptions } from 'better-convex/rsc';
import { cache } from 'react';
import { headers } from 'next/headers';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { hydrationConfig } from './query-client';
import { createCaller, createContext } from './server';

const createRSCContext = cache(async () => createContext({ headers: await headers() }));

// Direct server calls (not cached/hydrated)
export const caller = createCaller(createRSCContext);

// Server cRPC proxy (queryOptions only, no mutations)
export const crpc = createServerCRPCProxy({ api });

// Server QueryClient with HTTP-based fetching
const createServerQueryClient = () => new QueryClient({
  defaultOptions: {
    ...hydrationConfig,
    ...getServerQueryClientOptions({
      getToken: caller.getToken,
      convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
    }),
  },
});
export const getQueryClient = cache(createServerQueryClient);

// Fire-and-forget prefetch
export function prefetch<T extends { queryKey: readonly unknown[] }>(opts: T): void {
  void getQueryClient().prefetchQuery(opts);
}

// Hydration wrapper
export function HydrateClient({ children }: { children: React.ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      {children}
    </HydrationBoundary>
  );
}

// Awaited fetch + hydration (equivalent to Convex preloadQuery)
export function preloadQuery<T>(options: FetchQueryOptions<T>): Promise<T> {
  return getQueryClient().fetchQuery(options);
}
```

### Three RSC Patterns

| Pattern | Blocking | Returns data | Client hydration | Use case |
|---------|----------|-------------|------------------|----------|
| `prefetch` | No | No (void) | Yes | Client-only data, non-blocking |
| `caller` | Yes | Yes | **No** | Server-only logic (redirects, auth checks, sensitive data) |
| `preloadQuery` | Yes | Yes | Yes | Server + client data (metadata, 404 checks) |

**prefetch** (preferred — non-blocking, client owns data):
```tsx
export default async function PostsPage() {
  prefetch(crpc.posts.list.queryOptions({}));
  return <HydrateClient><PostList /></HydrateClient>;
}
```

**caller** (server-only, not hydrated):
```tsx
const user = await caller.user.getSessionUser({});
if (!user?.isAdmin) redirect('/');
```

**preloadQuery** (awaited + hydrated — use sparingly):
```tsx
const post = await preloadQuery(crpc.posts.get.queryOptions({ id }));
if (!post) notFound();
return <HydrateClient><h1>{post.title}</h1><PostContent /></HydrateClient>;
```

### Auth-Aware Prefetching

```tsx
prefetch(crpc.user.getCurrentUser.queryOptions({}, { skipUnauth: true }));
```

### Multiple Prefetches

```tsx
prefetch(crpc.user.getCurrentUser.queryOptions({}, { skipUnauth: true }));
prefetch(crpc.posts.list.queryOptions({}));
prefetch(crpc.stats.dashboard.queryOptions({}));
return <HydrateClient><Dashboard /></HydrateClient>;
```

### Metadata Generation

```tsx
export async function generateMetadata({ params }) {
  const { id } = await params;
  const post = await preloadQuery(crpc.posts.get.queryOptions({ id }));
  return { title: post?.title ?? 'Not Found', description: post?.excerpt };
}
```

### HydrateClient Placement

Must wrap ALL client components that use prefetched queries. Server and client proxies generate identical query keys (`['convexQuery', funcRef, args]`).

### Data Ownership Caveat

Don't render `preloadQuery` data in BOTH Server and Client components — the server-rendered part can't be revalidated by React Query. Prefer `prefetch` (let client own data) unless you need server-side access (metadata, 404, redirects).

---

## API Reference

### Infinite Query Return Value

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T[]` | Flattened array of all items |
| `pages` | `T[][]` | Raw page arrays |
| `fetchNextPage` | `(limit?) => void` | Load next page |
| `hasNextPage` | `boolean` | More pages exist |
| `status` | `PaginationStatus` | `'LoadingFirstPage' \| 'LoadingMore' \| 'CanLoadMore' \| 'Exhausted'` |
| `isPlaceholderData` | `boolean` | Showing placeholder |
