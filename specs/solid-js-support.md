# Plan: Add Solid.js Support to better-convex

## Task Description

Add Solid.js framework support to `better-convex` by making `crpc/` framework-agnostic and creating a new `solid/` module that provides the same CRPC proxy, query bridge, auth, and vanilla client capabilities using `@tanstack/solid-query`, `solid-js`, and `convex/browser` instead of React-specific dependencies.

This is a **breaking change** for anyone importing TanStack Query-dependent types from `better-convex/crpc` (they move to `better-convex/react`).

## Objective

When complete:
1. `better-convex/crpc` exports only framework-agnostic types and utilities (no TanStack/React imports)
2. `better-convex/react` works identically to today (re-exports moved types for API compatibility)
3. `better-convex/solid` provides full Solid.js support: CRPC proxy, ConvexQueryClient, auth, infinite queries, vanilla client
4. All 600 existing tests still pass
5. Solid tests deferred to follow-up PR

## Problem Statement

`crpc/types.ts` imports from `@tanstack/react-query` and `convex/react`, making the `better-convex/crpc` entry point unusable for Solid.js projects (which use `@tanstack/solid-query`). The types cannot be shared because TypeScript treats same-shaped types from different packages as incompatible in generic positions.

## Solution Approach

**Three-layer split:**
1. **Agnostic core** (`crpc/`): Types, query-options factories, error, transformer, proxy-factory — zero framework deps
2. **React layer** (`react/`): Decorator types from `@tanstack/react-query`, hooks, ConvexQueryClient using `convex/react`
3. **Solid layer** (`solid/`): Decorator types from `@tanstack/solid-query`, reactive primitives, ConvexQueryClient using `convex/browser`

**Shared proxy factory** in `crpc/proxy-factory.ts` with `ProxyStrategy` injection so `react/proxy.ts` and `solid/proxy.ts` are thin wrappers.

## Relevant Files

### Existing Files to Modify

- `packages/better-convex/src/crpc/types.ts` — Strip TanStack/React imports; keep only agnostic types (Meta, keys, pagination, symbols)
- `packages/better-convex/src/crpc/query-options.ts` — Change return types from `ConvexQueryOptions<T>` to plain object literal types
- `packages/better-convex/src/crpc/index.ts` — Update barrel exports (remove moved types)
- `packages/better-convex/src/react/proxy.ts` — Refactor to use `crpc/proxy-factory.ts` with React strategy
- `packages/better-convex/src/react/index.ts` — Re-export `react/crpc-types.ts` for backwards compat
- `packages/better-convex/src/react/use-query-options.ts` — Update imports to use `react/crpc-types.ts` instead of `crpc/types.ts`
- `packages/better-convex/src/react/use-infinite-query.ts` — Update imports
- `packages/better-convex/src/react/context.tsx` — Update imports for `CRPCClient`, `VanillaCRPCClient`
- `packages/better-convex/src/react/client.ts` — Update imports
- `packages/better-convex/src/react/vanilla-client.ts` — Update imports for `VanillaCRPCClient`
- `packages/better-convex/src/react/http-proxy.ts` — Update imports
- `packages/better-convex/src/react/singleton.ts` — No change needed (only uses `DataTransformerOptions`)
- `packages/better-convex/src/react/auth-store.tsx` — No change needed (only uses `crpc/error`)
- `packages/better-convex/src/internal/auth.ts` — React-specific (`useAuthSkip` calls React hooks); stays as-is
- `packages/better-convex/src/internal/hash.ts` — Imports `hashKey` from `@tanstack/react-query`; needs framework-agnostic version or per-framework copies
- `packages/better-convex/src/rsc/proxy-server.ts` — Update imports for `CRPCClient`, `InfiniteQueryOptsParam`
- `packages/better-convex/src/integration/crpc-generated-api.e2e.types.ts` — Update import for `CRPCClient`
- `packages/better-convex/package.json` — Add `./solid` export, update peer deps
- `packages/better-convex/tsdown.config.ts` — Add `solid/index` entry to client builds

### New Files

- `packages/better-convex/src/crpc/proxy-factory.ts` — Shared recursive proxy with `ProxyStrategy` injection
- `packages/better-convex/src/react/crpc-types.ts` — Moved decorator types (DecorateQuery, CRPCClient, etc.) importing from `@tanstack/react-query` + `convex/react`
- `packages/better-convex/src/solid/index.ts` — Barrel exports
- `packages/better-convex/src/solid/crpc-types.ts` — Decorator types importing from `@tanstack/solid-query` + `convex/browser`
- `packages/better-convex/src/solid/client.ts` — ConvexQueryClient using `ConvexClient.onUpdate()` from `convex/browser`
- `packages/better-convex/src/solid/context.tsx` — `createCRPCContext` using Solid `createContext`/`useContext`
- `packages/better-convex/src/solid/proxy.ts` — Thin wrapper: `ProxyStrategy` → Solid primitives
- `packages/better-convex/src/solid/query-options.ts` — `createConvexQueryOptions`, `createConvexInfiniteQueryOptions`, etc.
- `packages/better-convex/src/solid/infinite-query.ts` — `createInfiniteConvexQuery` using signals/effects
- `packages/better-convex/src/solid/auth-store.ts` — Auth using `createStore` from `solid-js/store` + context
- `packages/better-convex/src/solid/vanilla-client.ts` — Vanilla client using `ConvexClient` from `convex/browser`
- `packages/better-convex/src/solid/hash.ts` — `createHashFn` importing `hashKey` from `@tanstack/solid-query`

### Shared Infrastructure (No Changes Needed)

These files are framework-agnostic and reused by both React and Solid:

- `src/crpc/error.ts` — `CRPCClientError`, `defaultIsUnauthorized`
- `src/crpc/transformer.ts` — Data serialization/deserialization
- `src/crpc/http-types.ts` — HTTP type definitions
- `src/internal/types.ts` — `DeepPartial`, `DistributiveOmit`, `Simplify`, etc.
- `src/internal/query-key.ts` — `isConvexQuery`, `hashConvexQuery`, etc.
- `src/shared/meta-utils.ts` — `buildMetaIndex`, `getFuncRef`, `getFunctionType`, `getFunctionMeta`
- `src/server/caller.ts` — `CallerMeta` type

## Implementation Phases

### Phase 1: Foundation — Make crpc/ Framework-Agnostic

**Goal:** Strip all `@tanstack/react-query` and `convex/react` imports from `crpc/`.

1. **Split `crpc/types.ts`**: Keep agnostic types, move TanStack-dependent types to `react/crpc-types.ts`
2. **Update `crpc/query-options.ts`**: Change return types to plain object literals
3. **Create `crpc/proxy-factory.ts`**: Extract shared proxy logic from `react/proxy.ts`
4. **Update `crpc/index.ts`**: Remove moved exports

**Types staying in `crpc/types.ts`:**
```
FUNC_REF_SYMBOL, FnMeta, PaginatedFnMeta, Meta, AuthType
ConvexQueryKey<T>, ConvexActionKey<T>, ConvexMutationKey
ConvexQueryMeta, ConvexInfiniteQueryMeta, ConvexQueryHookOptions
PaginationOpts, InfiniteQueryInput<T>, ExtractPaginatedItem<T>
MutationVariables<T>
```

**Types moving to `react/crpc-types.ts` (and duplicated in `solid/crpc-types.ts`):**
```
ReservedQueryOptions, ReservedMutationOptions, ReservedInfiniteQueryOptions
ConvexQueryOptions<T>, ConvexActionOptions<T>
QueryOptsParam<T>, QueryOptsReturn<T>, ActionQueryOptsParam<T>, ActionQueryOptsReturn<T>
StaticQueryOptsParam, InfiniteQueryOptsParam<T>
ConvexInfiniteQueryOptions<T>, ConvexInfiniteQueryOptionsWithRef<T>
DecorateQuery<T>, DecorateMutation<T>, DecorateAction<T>, DecorateInfiniteQuery<T>
CRPCClient<TApi>
VanillaQuery<T>, VanillaMutation<T>, VanillaAction<T>, VanillaCRPCClient<TApi>
```

**`crpc/proxy-factory.ts` ProxyStrategy interface:**
```ts
export type ProxyStrategy = {
  queryOptions: (funcRef: FunctionReference<'query'>, args: unknown, opts?: unknown) => unknown;
  staticQueryOptions: (funcRef: FunctionReference<'query' | 'action'>, args: unknown, meta: unknown, opts?: unknown) => unknown;
  actionQueryOptions: (funcRef: FunctionReference<'action'>, args: unknown, opts?: unknown) => unknown;
  mutationOptions: (funcRef: FunctionReference<'mutation'>, opts?: unknown) => unknown;
  actionMutationOptions: (funcRef: FunctionReference<'action'>, opts?: unknown) => unknown;
  infiniteQueryOptions: (funcRef: FunctionReference<'query'>, args: unknown, opts?: unknown) => unknown;
  skipToken: unknown;
  queryKeyPrefix: (path: string[], meta: unknown) => 'convexQuery' | 'convexAction';
  queryFilter: (queryKey: unknown[], filters?: unknown) => unknown;
};

export function createCRPCProxyFactory(
  api: Record<string, unknown>,
  meta: CallerMeta,
  strategy: ProxyStrategy,
  transformer?: DataTransformerOptions
): unknown;
```

### Phase 2: Update React Layer

**Goal:** React layer imports from `react/crpc-types.ts` instead of `crpc/types.ts`. All existing behavior preserved.

1. **Create `react/crpc-types.ts`**: Move TanStack-dependent types here
2. **Update `react/proxy.ts`**: Use `crpc/proxy-factory.ts` with React strategy
3. **Update imports** across all `react/` files to use `react/crpc-types.ts` for moved types
4. **Update `react/index.ts`**: Re-export `react/crpc-types.ts`
5. **Update `rsc/proxy-server.ts`**: Import `CRPCClient` from `react/crpc-types.ts`
6. **Update `integration/crpc-generated-api.e2e.types.ts`**: Import from `react/crpc-types.ts`
7. **Handle `internal/hash.ts`**: This imports `hashKey` from `@tanstack/react-query`. Keep it as-is since it's only used by `react/client.ts`. For Solid, create `solid/hash.ts`.
8. **Handle `internal/auth.ts`**: This imports React hooks (`useSafeConvexAuth`, `useMeta`). Keep as-is for React. Create `solid/auth.ts` equivalent for Solid.

### Phase 3: Verify React Still Works

**Goal:** All 600 existing tests pass, typecheck passes.

1. Run `bun test` — must be 600 pass, 0 fail
2. Run `bun typecheck` — must pass
3. Run `bun lint:fix` — must pass

### Phase 4: Create Solid Layer

**Goal:** Full Solid.js support mirroring the React layer.

#### 4a. `solid/crpc-types.ts` — Decorator Types

Same types as `react/crpc-types.ts` but importing from:
- `@tanstack/solid-query` instead of `@tanstack/react-query`
- `convex/browser` for `Unsubscribe<T>` instead of `convex/react` for `Watch<T>`

Key difference for Vanilla types:
```ts
// React: VanillaQuery uses Watch<T> from convex/react
watchQuery(args, opts?): Watch<FunctionReturnType<T>>

// Solid: VanillaQuery uses onUpdate from convex/browser (callback-based)
subscribe(args, callback, onError?): Unsubscribe<FunctionReturnType<T>>
```

#### 4b. `solid/client.ts` — ConvexQueryClient

Bridge TanStack Query cache with Convex WebSocket subscriptions using `ConvexClient` from `convex/browser`.

**Key API differences from React version:**

| Aspect | React (`react/client.ts`) | Solid (`solid/client.ts`) |
|--------|--------------------------|--------------------------|
| Convex client | `ConvexReactClient` from `convex/react` | `ConvexClient` from `convex/browser` |
| Subscribe | `client.watchQuery(funcRef, args)` → `Watch<T>` | `client.onUpdate(funcRef, args, cb, errCb)` → `Unsubscribe<T>` |
| Get value | `watch.localQueryResult()` (pull) | Callback receives value (push) |
| Error | `try { watch.localQueryResult() } catch` | `onError` callback parameter |
| Unsubscribe | `watch.onUpdate(() => {})` returns unsub | `Unsubscribe<T>()` is callable |
| TanStack | `@tanstack/react-query` | `@tanstack/solid-query` |

**Core subscription pattern:**
```ts
private subscribeToQuery(funcName, args, queryHash, queryKey) {
  const unsub = this.convexClient.onUpdate(
    funcName as FunctionReference<'query'>,
    this.transformer.input.serialize(args),
    (result) => {
      // Push update into TanStack cache
      const existing = this.queryClient.getQueryData(queryKey);
      const hasResult = result !== null && result !== undefined;
      const hasExisting = existing !== null && existing !== undefined;
      if (hasResult || !hasExisting) {
        this.queryClient.setQueryData(queryKey, this.transformer.output.deserialize(result));
      }
    },
    (error) => {
      // Handle auth errors, skipUnauth, push error state
      this.handleSubscriptionError(queryHash, queryKey, error);
    }
  );
  this.subscriptions[queryHash] = { unsubscribe: () => unsub(), queryKey };
}
```

Same features as React version: `connect()`, `destroy()`, `queryFn()`, `hashFn()`, `unsubscribeAuthQueries()`, `unsubscribeDelay` debouncing.

#### 4c. `solid/auth-store.ts` — Auth with Solid Store

```ts
import { createStore } from 'solid-js/store';
import { createContext, useContext, type JSX } from 'solid-js';

type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  onQueryUnauthorized: (info: { queryName: string }) => void;
  isUnauthorized: (error: unknown) => boolean;
};

export function createAuthStore(initial?: Partial<AuthState>) {
  return createStore<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    onQueryUnauthorized: () => {},
    isUnauthorized: defaultIsUnauthorized,
    ...initial,
  });
}

// Context for auth store
const AuthContext = createContext<{ store: AuthState; setStore: SetStoreFunction<AuthState> }>();

export function AuthProvider(props: { store: ...; children: JSX.Element }) {
  return <AuthContext.Provider value={props.store}>{props.children}</AuthContext.Provider>;
}

export function useAuthStore() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('Missing AuthProvider');
  return ctx;
}
```

#### 4d. `solid/auth.ts` — Auth Skip Logic (Solid equivalent of `internal/auth.ts`)

```ts
// Same logic as internal/auth.ts but reads from Solid auth store instead of React hooks
export function useAuthSkip(funcRef, opts?) {
  const { store } = useAuthStore();
  const meta = useMeta(); // from solid/context.tsx
  // ... same skip logic using store.isAuthenticated, store.isLoading
}
```

#### 4e. `solid/query-options.ts` — Reactive Query Options

Solid equivalents of `react/use-query-options.ts`:
- `createConvexQueryOptions(funcRef, args, opts?)` — returns reactive options for `createQuery(() => ...)`
- `createConvexInfiniteQueryOptions(funcRef, args, opts)` — for infinite queries
- `createConvexActionQueryOptions(action, args, opts?)` — actions as queries
- `createConvexMutationOptions(mutation, opts?)` — for mutations
- `createConvexActionMutationOptions(action, opts?)` — actions as mutations

**Key Solid difference:** These return plain objects (not hooks). Reactivity comes from the caller wrapping in `createQuery(() => ...)`.

For mutations, instead of `useConvexMutationBase` from `convex/react`, use `convexClient.mutation()` from `convex/browser`.

#### 4f. `solid/proxy.ts` — CRPC Proxy for Solid

```ts
import { createCRPCProxyFactory } from '../crpc/proxy-factory';
import { skipToken } from '@tanstack/solid-query';

const solidStrategy: ProxyStrategy = {
  queryOptions: (funcRef, args, opts) => createConvexQueryOptions(funcRef, args, opts),
  mutationOptions: (funcRef, opts) => createConvexMutationOptions(funcRef, opts),
  // ... wire each to Solid query-options functions
  skipToken,
};

export function createCRPCOptionsProxy<TApi>(api, meta, transformer?) {
  return createCRPCProxyFactory(api, meta, solidStrategy, transformer) as CRPCClient<TApi>;
}
```

#### 4g. `solid/context.tsx` — CRPC Context

```ts
import { createContext, useContext, type JSX } from 'solid-js';

export function createCRPCContext<TApi>(options) {
  const Context = createContext<{ crpc: CRPCClient<TApi>; client: VanillaCRPCClient<TApi>; meta: Meta }>();

  function CRPCProvider(props: { children: JSX.Element; queryClient: QueryClient; convexUrl: string; ... }) {
    // Initialize ConvexClient (from convex/browser), ConvexQueryClient, proxy
    return <Context.Provider value={...}>{props.children}</Context.Provider>;
  }

  function useCRPC() { return useContext(Context)!.crpc; }
  function useCRPCClient() { return useContext(Context)!.client; }
  function useMeta() { return useContext(Context)!.meta; }

  return { CRPCProvider, useCRPC, useCRPCClient, useMeta };
}
```

#### 4h. `solid/infinite-query.ts` — Infinite Query

Port of `react/use-infinite-query.ts` using Solid primitives:
- `useState` → `createSignal`
- `useEffect` → `createEffect` + `onCleanup`
- `useRef` → plain variables (components run once in Solid)
- `useMemo` → `createMemo`
- `useCallback` → plain functions (no re-renders in Solid)
- `useQueries` → multiple `createQuery` calls

#### 4i. `solid/vanilla-client.ts` — Vanilla Client

Same recursive proxy pattern as `react/vanilla-client.ts` but using `ConvexClient` from `convex/browser`:
- `.query(args)` → `convexClient.query(funcRef, args)`
- `.mutate(args)` → `convexClient.mutation(funcRef, args)` or `convexClient.action(funcRef, args)`
- `.subscribe(args, callback, onError?)` → `convexClient.onUpdate(funcRef, args, callback, onError)` (replaces `watchQuery`)

#### 4j. `solid/hash.ts` — Hash Function

```ts
import { hashKey } from '@tanstack/solid-query';
import { hashConvexAction, hashConvexQuery, isConvexAction, isConvexQuery } from '../internal/query-key';

export function createHashFn(fallback = hashKey) {
  return (queryKey: readonly unknown[]): string => {
    if (isConvexQuery(queryKey)) return hashConvexQuery(queryKey);
    if (isConvexAction(queryKey)) return hashConvexAction(queryKey);
    return fallback(queryKey);
  };
}
```

### Phase 5: Build Configuration & Package Exports

1. **`tsdown.config.ts`**: Add `'solid/index': 'src/solid/index.ts'` to client builds section (no `"use client"` banner, no React compiler plugin)
2. **`package.json` exports**: Add `"./solid": "./dist/solid/index.js"`
3. **`package.json` peer deps**: Make `@tanstack/react-query` optional, add `@tanstack/solid-query` and `solid-js` as optional

### Phase 6: Changeset & Final Validation

1. Run `bun test` — all 600 tests pass
2. Run `bun typecheck` — passes
3. Run `bun lint:fix` — passes
4. Write changeset for breaking change (types moved from `crpc` to `react`)

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members.

### Team Members

- Builder
  - Name: builder-crpc-agnostic
  - Role: Make crpc/ framework-agnostic (split types, update query-options, create proxy-factory)
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-react-update
  - Role: Update React layer to use new crpc-types.ts and proxy-factory
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-solid-core
  - Role: Create solid/ module (crpc-types, client, context, proxy, query-options, hash)
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-solid-features
  - Role: Create solid/ advanced features (infinite-query, auth-store, vanilla-client)
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-config
  - Role: Update package.json, tsdown.config.ts, barrel exports
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: validator
  - Role: Run tests, typecheck, lint to verify nothing broke
  - Agent Type: general-purpose
  - Resume: false

## Step by Step Tasks

### 1. Run Baseline Tests
- **Task ID**: baseline-tests
- **Depends On**: none
- **Assigned To**: validator
- **Agent Type**: general-purpose
- **Parallel**: false
- Run `bun test` and verify 600 pass, 0 fail
- Run `bun typecheck` and verify passes
- Record baseline for comparison

### 2. Split crpc/types.ts — Agnostic Core
- **Task ID**: split-crpc-types
- **Depends On**: baseline-tests
- **Assigned To**: builder-crpc-agnostic
- **Agent Type**: general-purpose
- **Parallel**: false
- Read `src/crpc/types.ts` fully
- Remove all imports from `@tanstack/react-query` and `convex/react`
- Keep: `FUNC_REF_SYMBOL`, `FnMeta`, `PaginatedFnMeta`, `Meta`, `AuthType`, `ConvexQueryKey<T>`, `ConvexActionKey<T>`, `ConvexMutationKey`, `ConvexQueryMeta`, `ConvexInfiniteQueryMeta`, `ConvexQueryHookOptions`, `PaginationOpts`, `InfiniteQueryInput<T>`, `ExtractPaginatedItem<T>`, `MutationVariables<T>`, `EmptyObject`, `IsPaginated<T>`
- Remove all other types (they go to `react/crpc-types.ts`)
- Update `crpc/index.ts` barrel

### 3. Update crpc/query-options.ts Return Types
- **Task ID**: update-query-options
- **Depends On**: split-crpc-types
- **Assigned To**: builder-crpc-agnostic
- **Agent Type**: general-purpose
- **Parallel**: false
- Read `src/crpc/query-options.ts` fully
- Replace `ConvexQueryOptions<T>` return type with plain object literal type
- Replace `ConvexActionOptions<T>` return type with plain object literal type
- Replace `ConvexInfiniteQueryOptions<T>` return type with plain object literal type
- Remove import of those types from `./types`
- Keep `ConvexQueryMeta`, `ConvexInfiniteQueryMeta`, `Meta` imports (still in agnostic types)

### 4. Create crpc/proxy-factory.ts
- **Task ID**: create-proxy-factory
- **Depends On**: split-crpc-types
- **Assigned To**: builder-crpc-agnostic
- **Agent Type**: general-purpose
- **Parallel**: true (with task 3)
- Read `src/react/proxy.ts` to understand current implementation
- Extract the recursive proxy logic into `crpc/proxy-factory.ts`
- Define `ProxyStrategy` interface
- Terminal methods delegate to strategy instead of calling hooks directly
- Export `createCRPCProxyFactory` function
- Keep framework-agnostic: only import from `convex/server`, `crpc/`, `shared/`, `server/caller`

### 5. Create react/crpc-types.ts
- **Task ID**: create-react-crpc-types
- **Depends On**: split-crpc-types
- **Assigned To**: builder-react-update
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 3, 4)
- Create new file `src/react/crpc-types.ts`
- Move all TanStack-dependent types from old `crpc/types.ts`:
  - Import from `@tanstack/react-query`: `DefaultError`, `QueryFilters`, `SkipToken`, `UseMutationOptions`, `UseQueryOptions`
  - Import from `convex/react`: `Watch`, `WatchQueryOptions`
  - Import agnostic types from `../crpc/types`
  - All decorator types: `DecorateQuery`, `DecorateMutation`, `DecorateAction`, `DecorateInfiniteQuery`
  - All options types: `ConvexQueryOptions`, `ConvexActionOptions`, `InfiniteQueryOptsParam`, `ConvexInfiniteQueryOptions`, `ConvexInfiniteQueryOptionsWithRef`
  - Client types: `CRPCClient`, `VanillaQuery`, `VanillaMutation`, `VanillaAction`, `VanillaCRPCClient`
  - Internal types: `ReservedQueryOptions`, `ReservedMutationOptions`, `ReservedInfiniteQueryOptions`, `QueryOptsParam`, `QueryOptsReturn`, `ActionQueryOptsParam`, `ActionQueryOptsReturn`, `StaticQueryOptsParam`, `InfiniteQueryOptsReturn`

### 6. Update React Layer Imports
- **Task ID**: update-react-imports
- **Depends On**: create-react-crpc-types, update-query-options, create-proxy-factory
- **Assigned To**: builder-react-update
- **Agent Type**: general-purpose
- **Parallel**: false
- Update `react/proxy.ts` to use `crpc/proxy-factory.ts` with React strategy
- Update `react/use-query-options.ts` to import types from `./crpc-types` instead of `../crpc/types`
- Update `react/use-infinite-query.ts` imports
- Update `react/context.tsx` imports for `CRPCClient`, `VanillaCRPCClient`
- Update `react/client.ts` imports
- Update `react/vanilla-client.ts` imports for `VanillaCRPCClient`
- Update `react/http-proxy.ts` imports if needed
- Update `react/index.ts` to re-export from `./crpc-types`
- Update `rsc/proxy-server.ts` to import `CRPCClient`, `InfiniteQueryOptsParam` from `../react/crpc-types`
- Update `integration/crpc-generated-api.e2e.types.ts` import

### 7. Verify React Layer
- **Task ID**: verify-react
- **Depends On**: update-react-imports
- **Assigned To**: validator
- **Agent Type**: general-purpose
- **Parallel**: false
- Run `bun test` — all 600 tests must pass
- Run `bun typecheck` — must pass
- Run `bun lint:fix`
- This is the critical gate before creating the Solid layer

### 8. Create Solid Types and Hash
- **Task ID**: create-solid-types
- **Depends On**: verify-react
- **Assigned To**: builder-solid-core
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 9, 10)
- Create `src/solid/crpc-types.ts` — same decorator types as `react/crpc-types.ts` but:
  - Import from `@tanstack/solid-query` instead of `@tanstack/react-query`
  - For Vanilla types: use `ConvexClient` from `convex/browser`, `Unsubscribe<T>` pattern
  - VanillaQuery: `.subscribe(args, callback, onError?)` instead of `.watchQuery()`
- Create `src/solid/hash.ts` — same as `internal/hash.ts` but import `hashKey` from `@tanstack/solid-query`

### 9. Create Solid ConvexQueryClient
- **Task ID**: create-solid-client
- **Depends On**: verify-react
- **Assigned To**: builder-solid-core
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 8, 10)
- Create `src/solid/client.ts` — ConvexQueryClient using `ConvexClient` from `convex/browser`
- Use `onUpdate()` push-based subscription instead of `watchQuery()` pull
- Same cache event handling: subscribe on added/observerAdded, unsubscribe on removed/observerRemoved
- Same debounced unsubscribe with `unsubscribeDelay`
- Same SSR support with `ConvexHttpClient`
- Same `queryFn()` and `hashFn()` methods
- Import `notifyManager`, `QueryClient`, etc. from `@tanstack/solid-query`

### 10. Create Solid Auth Store
- **Task ID**: create-solid-auth
- **Depends On**: verify-react
- **Assigned To**: builder-solid-features
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 8, 9)
- Create `src/solid/auth-store.ts` using `createStore` from `solid-js/store`
- Create `src/solid/auth.ts` — equivalent of `internal/auth.ts` using Solid store

### 11. Create Solid Query Options and Proxy
- **Task ID**: create-solid-proxy
- **Depends On**: create-solid-types, create-solid-client, create-solid-auth
- **Assigned To**: builder-solid-core
- **Agent Type**: general-purpose
- **Parallel**: false
- Create `src/solid/query-options.ts` — Solid equivalents of `react/use-query-options.ts`
- Create `src/solid/proxy.ts` — use `crpc/proxy-factory.ts` with Solid strategy
- Create `src/solid/context.tsx` — `createCRPCContext` using Solid `createContext`

### 12. Create Solid Infinite Query and Vanilla Client
- **Task ID**: create-solid-advanced
- **Depends On**: create-solid-proxy
- **Assigned To**: builder-solid-features
- **Agent Type**: general-purpose
- **Parallel**: false
- Create `src/solid/infinite-query.ts` — port using `createSignal`/`createEffect`/`onCleanup`
- Create `src/solid/vanilla-client.ts` — using `ConvexClient` from `convex/browser`
- Create `src/solid/index.ts` — barrel exports

### 13. Update Build Config and Package Exports
- **Task ID**: update-config
- **Depends On**: create-solid-advanced
- **Assigned To**: builder-config
- **Agent Type**: general-purpose
- **Parallel**: false
- Update `tsdown.config.ts`: Add `'solid/index': 'src/solid/index.ts'` to server-safe builds (Solid doesn't use React compiler or `"use client"`)
- Update `package.json` exports: Add `"./solid": "./dist/solid/index.js"`
- Update `package.json` peerDependencies: Make `@tanstack/react-query` optional, add `@tanstack/solid-query` (optional) and `solid-js` (optional)

### 14. Final Validation
- **Task ID**: validate-all
- **Depends On**: update-config
- **Assigned To**: validator
- **Agent Type**: general-purpose
- **Parallel**: false
- Run `bun test` — all 600 tests must pass
- Run `bun typecheck` — must pass
- Run `bun lint:fix` — must pass
- Run `bun --cwd packages/better-convex build` — must succeed
- Verify `dist/solid/index.js` and `dist/solid/index.d.ts` exist

### 15. Write Changeset
- **Task ID**: write-changeset
- **Depends On**: validate-all
- **Assigned To**: builder-config
- **Agent Type**: general-purpose
- **Parallel**: false
- Write changeset documenting:
  - BREAKING: TanStack Query-dependent types moved from `better-convex/crpc` to `better-convex/react`
  - FEATURE: New `better-convex/solid` entry point for Solid.js support
  - List migrated types and new import paths

## Acceptance Criteria

1. `bun test` passes all 600 tests (zero regressions)
2. `bun typecheck` passes
3. `bun lint:fix` passes
4. `bun --cwd packages/better-convex build` succeeds
5. `better-convex/crpc` has zero imports from `@tanstack/react-query` or `convex/react`
6. `better-convex/react` re-exports all types previously in `better-convex/crpc` (backwards compat for existing React users via `better-convex/react`)
7. `better-convex/solid` exports: `CRPCClient`, `createCRPCContext`, `ConvexQueryClient`, `createConvexQueryOptions`, `createInfiniteConvexQuery`, `createAuthStore`, `createVanillaCRPCProxy`, `createHashFn`
8. `dist/solid/index.js` and `dist/solid/index.d.ts` generated
9. Changeset written

## Validation Commands

- `bun test` — Run all tests (expect 600 pass, 0 fail)
- `bun typecheck` — TypeScript type checking
- `bun lint:fix` — Lint and auto-fix
- `bun --cwd packages/better-convex build` — Build package
- `ls packages/better-convex/dist/solid/` — Verify Solid build output exists
- `grep -r "@tanstack/react-query" packages/better-convex/src/crpc/` — Must return empty (zero React imports in crpc/)
- `grep -r "convex/react" packages/better-convex/src/crpc/` — Must return empty (zero convex/react imports in crpc/)

## Notes

- New dependencies needed: `bun add -d @tanstack/solid-query solid-js` (dev deps for type checking)
- `convex/browser` is already available (part of `convex` package)
- Solid tests are deferred to a follow-up PR
- RSC support is React-only (not applicable to Solid)
- The `internal/auth.ts` file is React-specific (imports React hooks). Solid gets its own `solid/auth.ts`.
- The `internal/hash.ts` file imports from `@tanstack/react-query`. Solid gets `solid/hash.ts`. This file is only consumed by `react/client.ts` so no need to make it agnostic.
- `auth-mutations.ts` is a better-auth integration and only imports from `@tanstack/react-query` — stays React-only for now.
- `http-proxy.ts` is React-specific — defer Solid HTTP proxy to follow-up.
- `plugins/ratelimit/react/` is React-specific — defer Solid plugin adapters to follow-up.
