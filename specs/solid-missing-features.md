# Plan: Add Missing Solid.js Features

## Task Description

Complete the Solid.js flavor of better-convex by implementing features that exist in the React flavor but are missing from the Solid implementation. This covers: infinite query primitive, singleton utilities, rich auth store (guards, conditional render components, auth bridge), and cleanup of empty stub files.

## Objective

When complete:
1. `better-convex/solid` exports `createInfiniteConvexQuery` — a Solid primitive for paginated Convex queries with real-time updates, stale cursor recovery, and page splitting
2. `better-convex/solid` exports singleton utilities (`getQueryClientSingleton`, `getConvexQueryClientSingleton`) for SSR-safe client reuse
3. `better-convex/solid` exports rich auth primitives: `createAuthAccessors` (reactive auth hooks), `Authenticated`/`Unauthenticated`/`MaybeAuthenticated`/`MaybeUnauthenticated` (conditional render), `createAuthGuard`
4. Empty stub files (`solid/auth-store.tsx`, `solid/context.tsx`) are removed
5. All existing tests pass, typecheck passes, build succeeds

## Problem Statement

The Solid.js implementation was added in the previous PR but several planned and unplanned features were not implemented:

1. **`createInfiniteConvexQuery`** (planned in spec, not implemented) — The React version (`useInfiniteConvexQuery`) is a 794-line hook that manages multi-page pagination with Convex WebSocket subscriptions, stale cursor recovery, page splitting, deduplication, and scroll restoration. Solid has no equivalent.
2. **Singleton utilities** — React has `getQueryClientSingleton` and `getConvexQueryClientSingleton` for SSR-safe singleton management. Useful for SolidStart apps.
3. **Rich auth store** — React's `auth-store.tsx` provides `useAuth`, `useMaybeAuth`, `useIsAuth`, `useAuthGuard`, `Authenticated`/`Unauthenticated` components, and `ConvexProviderWithAuth` bridge. Solid only has basic `createAuthStore`/`useAuthStore`.
4. **Empty files** — `solid/auth-store.tsx` and `solid/context.tsx` export `{}` and should be removed.

## Solution Approach

### Infinite Query

Port the React `useInfiniteConvexQuery` to Solid using these primitive mappings:
- `useState` → `createSignal`
- `useEffect` → `createEffect` + `onCleanup`
- `useRef` → plain variables (Solid components run once)
- `useMemo` → `createMemo`
- `useCallback` → plain functions
- `useQueries` → multiple `createQuery` calls managed via `createMemo`
- `useQueryClient` → import from context or parameter

Key architectural difference: In Solid, components run once. State is reactive via signals. The infinite query must use `createEffect` for side effects (stale cursor recovery, page splitting) and return a reactive accessor.

The pagination state persistence pattern (storing in queryClient) works identically in Solid since TanStack Query's `QueryClient` is framework-agnostic.

### Singleton

Direct port — `getQueryClientSingleton` and `getConvexQueryClientSingleton` use `globalThis` storage and are framework-agnostic. Only difference: import `QueryClient` from `@tanstack/solid-query` and use Solid's `ConvexQueryClient`.

### Rich Auth

Port auth accessors and conditional render components using Solid primitives:
- `useAuth` → `createAuth` (returns reactive accessor)
- `Authenticated`/`Unauthenticated` → Solid components using `Show` or conditional render
- `useAuthGuard` → `createAuthGuard` (returns function)
- `ConvexProviderWithAuth` — Not applicable (Solid uses `convex/browser` `ConvexClient`, not `convex/react` `ConvexProviderWithAuth`). Skip this.
- `FetchAccessTokenContext` — Solid equivalent using `createContext`

## Relevant Files

### Existing Files to Modify

- `packages/better-convex/src/solid/index.ts` — Add exports for infinite-query, singleton, and new auth primitives
- `packages/better-convex/src/solid/auth-store.ts` — Add rich auth accessors (createAuth, createAuthGuard, etc.)

### New Files

- `packages/better-convex/src/solid/infinite-query.ts` — Port of `react/use-infinite-query.ts` using Solid primitives
- `packages/better-convex/src/solid/singleton.ts` — Port of `react/singleton.ts` for Solid

### Files to Delete

- `packages/better-convex/src/solid/auth-store.tsx` — Empty stub (`export {}`)
- `packages/better-convex/src/solid/context.tsx` — Empty stub (`export {}`)

### Reference Files (Read Only)

- `packages/better-convex/src/react/use-infinite-query.ts` — Source for infinite query port (794 lines)
- `packages/better-convex/src/react/use-infinite-query.test.tsx` — Test patterns
- `packages/better-convex/src/react/singleton.ts` — Source for singleton port
- `packages/better-convex/src/react/singleton.test.ts` — Test patterns
- `packages/better-convex/src/react/auth-store.tsx` — Source for auth primitives
- `packages/better-convex/src/react/auth-store.test.tsx` — Test patterns
- `packages/better-convex/src/solid/proxy.ts` — Already has `infiniteQueryOptions` terminal method
- `packages/better-convex/src/solid/client.ts` — ConvexQueryClient for Solid (832 lines)
- `packages/better-convex/src/solid/crpc-types.ts` — Solid type definitions
- `packages/better-convex/src/solid/query-options.ts` — Existing query option factories
- `packages/better-convex/src/solid/context.ts` — Solid context (actual implementation)

## Implementation Phases

### Phase 1: Cleanup — Remove Empty Stubs

Delete `solid/auth-store.tsx` and `solid/context.tsx` (both just `export {}`). These cause confusion and serve no purpose.

### Phase 2: Infinite Query — Core Implementation

Port `react/use-infinite-query.ts` to `solid/infinite-query.ts`. This is the largest piece of work (~400-500 lines).

**Key Components to Port:**

1. **PaginationState type** — Reuse as-is (framework-agnostic)
2. **Pagination ID store** — Global `Map<string, number>` (framework-agnostic, reuse)
3. **`createStaleCursorRecovery`** — Port from `useStaleCursorRecovery`:
   - `useEffect` → `createEffect`
   - `useRef` → plain variable
   - State updates via signal setters
4. **`createInfiniteConvexQueryInternal`** — Port from `useInfiniteQueryInternal`:
   - `useState` → `createSignal` for pagination state
   - `useRef(prevArgs)` → plain `let prevArgs` (component runs once in Solid)
   - `useEffect` for state change detection → `createEffect`
   - `useQueries` → `createQueries` from `@tanstack/solid-query`
   - `useMemo` → `createMemo`
   - `useCallback` → plain function
   - `useQueryClient()` → accept as parameter or from context
5. **`createInfiniteConvexQuery`** — Public API:
   - Auth handling using explicit auth state (not hooks)
   - Returns reactive accessor with `data`, `pages`, `fetchNextPage`, `hasNextPage`, `status`

**Solid-specific considerations:**
- `createQueries` in `@tanstack/solid-query` takes a reactive accessor `() => queries[]`
- The `combine` option works the same way
- State changes via signal setters trigger reactive updates automatically
- No need for `useCallback` wrappers — functions are stable in Solid

**Return type:**
```ts
type CreateInfiniteQueryResult<T> = {
  data: T[];
  pages: T[][];
  fetchNextPage: (limit?: number) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  status: PaginationStatus;
  isLoading: boolean;
  error: Error | null;
};
```

### Phase 3: Singleton Utilities

Port `react/singleton.ts` to `solid/singleton.ts`:

```ts
import type { QueryClient } from '@tanstack/solid-query';
import type { ConvexClient } from 'convex/browser';
import type { DataTransformerOptions } from '../crpc/transformer';
import type { AuthState } from './auth-store';
import { ConvexQueryClient } from './client';

export const getQueryClientSingleton = (
  factory: () => QueryClient,
  symbolKey = 'convex.queryClient'
): QueryClient => {
  const key = Symbol.for(symbolKey);
  if (typeof window === 'undefined') return factory();
  if (!(globalThis as any)[key]) (globalThis as any)[key] = factory();
  return (globalThis as any)[key] as QueryClient;
};

export type ConvexQueryClientSingletonOptions = {
  authStore?: { get(key: keyof AuthState): AuthState[keyof AuthState] };
  convex: ConvexClient;
  queryClient: QueryClient;
  symbolKey?: string;
  unsubscribeDelay?: number;
  transformer?: DataTransformerOptions;
};

export const getConvexQueryClientSingleton = (opts: ConvexQueryClientSingletonOptions): ConvexQueryClient => {
  // Same globalThis pattern as React version
  // Uses ConvexClient instead of ConvexReactClient
};
```

### Phase 4: Rich Auth Primitives

Add to `solid/auth-store.ts`:

1. **`createAuth()`** — Reactive auth accessor:
```ts
export function createAuth() {
  const { store } = useAuthStore();
  return {
    get hasSession() { return !!store.token; },
    get isAuthenticated() { return store.isAuthenticated; },
    get isLoading() { return store.isLoading; },
  };
}
```

2. **`createMaybeAuth()`** — Returns reactive `() => boolean` for token presence
3. **`createIsAuth()`** — Returns reactive `() => boolean` for server-verified auth
4. **`createAuthGuard()`** — Returns function that checks auth before action:
```ts
export function createAuthGuard() {
  const { store } = useAuthStore();
  return (callback?: () => Promise<void> | void) => {
    if (!store.isAuthenticated) {
      store.onMutationUnauthorized?.();
      return true;
    }
    return callback ? void callback() : false;
  };
}
```

5. **Conditional render components** (using Solid's `children` prop pattern):
```ts
import { type JSX, Show } from 'solid-js';

export function Authenticated(props: { children: JSX.Element }) {
  const auth = createAuth();
  return <Show when={auth.isAuthenticated}>{props.children}</Show>;
}

export function Unauthenticated(props: { children: JSX.Element }) {
  const auth = createAuth();
  return <Show when={!auth.isLoading && !auth.isAuthenticated}>{props.children}</Show>;
}

export function MaybeAuthenticated(props: { children: JSX.Element }) {
  const auth = createAuth();
  return <Show when={auth.hasSession}>{props.children}</Show>;
}

export function MaybeUnauthenticated(props: { children: JSX.Element }) {
  const auth = createAuth();
  return <Show when={!auth.hasSession}>{props.children}</Show>;
}
```

6. **`decodeJwtExp`** — Port as-is (framework-agnostic utility)

**Not porting** (React-specific or deferred):
- `ConvexProviderWithAuth` — Uses `convex/react`'s provider, not applicable to Solid
- `ConvexAuthBridge` — Specific to `@convex-dev/auth` React provider
- `useSafeConvexAuth` — Wraps `useConvexAuth` from `convex/react`
- `FetchAccessTokenContext` — Better-auth specific, defer to follow-up

### Phase 5: Update Barrel Exports & Validate

1. Update `solid/index.ts` to export new modules
2. Run `bun typecheck`
3. Run `bun test`
4. Run `bun lint:fix`
5. Run `bun --cwd packages/better-convex build`

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members.

### Team Members

- Builder
  - Name: builder-cleanup
  - Role: Remove empty stub files and update barrel exports
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-infinite-query
  - Role: Port the infinite query from React to Solid (largest task)
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-singleton
  - Role: Create singleton utilities for Solid
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-auth
  - Role: Add rich auth primitives to Solid auth-store
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: builder-exports
  - Role: Update barrel exports and fix any import issues
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: validator
  - Role: Run tests, typecheck, lint, build to verify nothing broke
  - Agent Type: general-purpose
  - Resume: false

## Step by Step Tasks

### 1. Remove Empty Stub Files
- **Task ID**: cleanup-stubs
- **Depends On**: none
- **Assigned To**: builder-cleanup
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 2, 3, 4)
- Delete `packages/better-convex/src/solid/auth-store.tsx` (contains only `export {}`)
- Delete `packages/better-convex/src/solid/context.tsx` (contains only `export {}`)
- Verify no other files import from these deleted files

### 2. Create Solid Infinite Query
- **Task ID**: create-infinite-query
- **Depends On**: none
- **Assigned To**: builder-infinite-query
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 1, 3, 4)
- Read `packages/better-convex/src/react/use-infinite-query.ts` fully (794 lines)
- Read `packages/better-convex/src/solid/client.ts` to understand Solid's ConvexQueryClient
- Read `packages/better-convex/src/solid/query-options.ts` to understand existing query option factories
- Read `packages/better-convex/src/solid/crpc-types.ts` for type definitions
- Create `packages/better-convex/src/solid/infinite-query.ts`
- Port all logic using Solid primitive mappings:
  - `useState` → `createSignal`
  - `useEffect` → `createEffect` + `onCleanup`
  - `useRef` → plain `let` variables
  - `useMemo` → `createMemo`
  - `useCallback` → plain functions
  - `useQueries` → `createQueries` from `@tanstack/solid-query`
  - `useQueryClient()` → accept `QueryClient` as parameter
- Export `createInfiniteConvexQuery` as the public API
- Export `PaginationState`, `PaginationStatus`, `CreateInfiniteQueryResult` types
- Auth handling: Accept `authState` and `meta` as parameters (not hooks)
- The `FUNC_REF_SYMBOL` extraction from infinite query options works the same way

### 3. Create Singleton Utilities
- **Task ID**: create-singleton
- **Depends On**: none
- **Assigned To**: builder-singleton
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 1, 2, 4)
- Read `packages/better-convex/src/react/singleton.ts` fully
- Read `packages/better-convex/src/solid/client.ts` for ConvexQueryClient constructor signature
- Read `packages/better-convex/src/solid/auth-store.ts` for AuthState type
- Create `packages/better-convex/src/solid/singleton.ts`
- Port `getQueryClientSingleton` — import `QueryClient` from `@tanstack/solid-query`
- Port `getConvexQueryClientSingleton` — use `ConvexClient` from `convex/browser` instead of `ConvexReactClient`
- Adapt `ConvexQueryClientSingletonOptions` type for Solid (use Solid's auth store accessor)

### 4. Add Rich Auth Primitives
- **Task ID**: create-auth-rich
- **Depends On**: cleanup-stubs (because we delete auth-store.tsx)
- **Assigned To**: builder-auth
- **Agent Type**: general-purpose
- **Parallel**: true (with tasks 2, 3)
- Read `packages/better-convex/src/react/auth-store.tsx` fully (273 lines)
- Read `packages/better-convex/src/solid/auth-store.ts` to understand existing primitives
- Add to `packages/better-convex/src/solid/auth-store.ts`:
  - `decodeJwtExp(token: string): number | null` — direct port
  - `onMutationUnauthorized` field to `AuthState` type (currently missing)
  - `createAuth()` — reactive auth accessor returning `{ hasSession, isAuthenticated, isLoading }`
  - `createMaybeAuth()` — reactive `boolean` for token presence
  - `createIsAuth()` — reactive `boolean` for server-verified auth
  - `createAuthGuard()` — function that checks auth before action
  - `Authenticated`, `Unauthenticated`, `MaybeAuthenticated`, `MaybeUnauthenticated` — conditional render components using Solid's `Show`
- Do NOT port: `ConvexProviderWithAuth`, `ConvexAuthBridge`, `useSafeConvexAuth`, `FetchAccessTokenContext` (React-specific)

### 5. Update Barrel Exports
- **Task ID**: update-exports
- **Depends On**: create-infinite-query, create-singleton, create-auth-rich, cleanup-stubs
- **Assigned To**: builder-exports
- **Agent Type**: general-purpose
- **Parallel**: false
- Update `packages/better-convex/src/solid/index.ts`:
  - Add `export * from './infinite-query'`
  - Add `export * from './singleton'`
  - Verify `auth-store` re-exports include new auth primitives
  - Remove any imports from deleted files if present
- Verify no circular imports

### 6. Verify Everything Works
- **Task ID**: verify-all
- **Depends On**: update-exports
- **Assigned To**: validator
- **Agent Type**: general-purpose
- **Parallel**: false
- Run `bun typecheck` — must pass
- Run `bun test` — all existing tests must pass
- Run `bun lint:fix` — must pass
- Run `bun --cwd packages/better-convex build` — must succeed
- Verify `dist/solid/index.js` contains new exports
- Verify no React imports in `solid/` directory: `grep -r "@tanstack/react-query\|convex/react" packages/better-convex/src/solid/`

## Acceptance Criteria

1. `bun typecheck` passes
2. `bun test` passes (all existing tests, zero regressions)
3. `bun lint:fix` passes
4. `bun --cwd packages/better-convex build` succeeds
5. `createInfiniteConvexQuery` exported from `better-convex/solid` with pagination state persistence, stale cursor recovery, page splitting, and deduplication
6. `getQueryClientSingleton` and `getConvexQueryClientSingleton` exported from `better-convex/solid`
7. Auth primitives exported: `createAuth`, `createAuthGuard`, `Authenticated`, `Unauthenticated`, `MaybeAuthenticated`, `MaybeUnauthenticated`, `decodeJwtExp`
8. Zero imports from `@tanstack/react-query` or `convex/react` in `solid/` directory
9. No empty stub files (`solid/auth-store.tsx`, `solid/context.tsx` removed)

## Validation Commands

- `bun typecheck` — TypeScript type checking
- `bun test` — Run all tests (expect all pass, 0 fail)
- `bun lint:fix` — Lint and auto-fix
- `bun --cwd packages/better-convex build` — Build package
- `grep -r "@tanstack/react-query" packages/better-convex/src/solid/` — Must return empty
- `grep -r "convex/react" packages/better-convex/src/solid/` — Must return empty
- `grep -r "createInfiniteConvexQuery" packages/better-convex/dist/solid/` — Must find export

## Notes

- `@tanstack/solid-query` provides `createQueries` (equivalent of React's `useQueries`) which supports the `combine` option needed for infinite query
- Solid components run once — no re-render cycle. All reactivity is through signals/stores. This simplifies some patterns (no `useCallback` wrappers needed) but requires careful use of `createEffect` for side effects
- The `FUNC_REF_SYMBOL` pattern from the proxy already works in Solid (see `solid/proxy.ts` lines 188-194)
- Solid tests are deferred to follow-up PR (per original plan). This PR adds the implementation only.
- The `auth-mutations.ts` (better-auth integration) and `http-proxy.ts` are explicitly deferred — they require separate planning
- The conditional render components (`Authenticated`, etc.) use JSX and need the Solid JSX transform. Since `auth-store.ts` will now contain JSX, it should be renamed to `auth-store.tsx` or the JSX components should be in a separate file. **Decision: Keep auth primitives in `auth-store.ts` (no JSX), create `solid/auth-components.tsx` for the JSX conditional render components.**
