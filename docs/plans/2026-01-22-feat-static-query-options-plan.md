/work---
title: feat: Add staticQueryOptions for non-hook event handler usage
type: feat
date: 2026-01-22

---

# feat: Add staticQueryOptions for Non-Hook Event Handler Usage

## Overview

Add `staticQueryOptions` method to the CRPC proxy that returns TanStack Query options without React hooks, enabling usage in event handlers like `onClick → prefetchQuery`.

**Use case:**

```typescript
const queryClient = useQueryClient();

const handleHover = () => {
  queryClient.prefetchQuery(crpc.user.get.staticQueryOptions({ id }));
};
```

## Problem Statement

Current `queryOptions` is a hook (uses `useAuthSkip`, `useMeta`) - can only be called inside React components. Event handlers need non-hook access for prefetching/fetching.

## Proposed Solution

Add `staticQueryOptions` as a new terminal method on the CRPC proxy that calls the existing non-hook `convexQuery()` and `convexAction()` functions directly.

## Acceptance Criteria

- [ ] Add `staticQueryOptions` terminal method to proxy for queries
- [ ] Type definitions added to `DecorateQuery` and `DecorateAction` in types.ts
- [ ] Accepts `args` parameter (same signature as `queryOptions`)
- [ ] Accepts `skipToken` (converts to `'skip'` internally)
- [ ] Handles actions via `convexAction()` (same as hook version)
- [ ] Returns `ConvexQueryOptions & { meta: ConvexQueryMeta }`
- [ ] No breaking changes to existing `queryOptions`

## Technical Considerations

**Auth handling:** No reactive `enabled` - queryFn in `ConvexQueryClient` handles auth at execution time (throws `UNAUTHORIZED` if needed).

**Meta access:** Proxy has `meta` (CallerMeta) in closure - pass to `convexQuery()` for authType detection.

**Out of scope:** `staticInfiniteQueryOptions`, `staticMutationOptions`.

## MVP

### packages/kitcn/src/react/proxy.ts

Add after line ~122 (after `queryOptions` terminal method):

```typescript
// Terminal method: staticQueryOptions (non-hook for event handlers)
if (prop === "staticQueryOptions") {
  return (args: unknown = {}, opts?: { skipUnauth?: boolean }) => {
    const funcRef = getFuncRef(api, path);
    const fnType = getFunctionType(path, meta);

    // Convert skipToken to 'skip' for convexQuery/convexAction
    const finalArgs = args === skipToken ? "skip" : args;

    // Actions use convexAction (one-shot, no subscription)
    if (fnType === "action") {
      return convexAction(
        funcRef as FunctionReference<"action">,
        finalArgs as FunctionArgs<FunctionReference<"action">>,
        meta,
        opts
      );
    }

    return convexQuery(
      funcRef as FunctionReference<"query">,
      finalArgs as FunctionArgs<FunctionReference<"query">>,
      meta,
      opts
    );
  };
}
```

### packages/kitcn/src/crpc/types.ts

Add to `DecorateQuery<T>` type (around line 215) and `DecorateAction<T>` (around line 362):

```typescript
export type DecorateQuery<T extends FunctionReference<'query'>> = {
  queryOptions: /* existing */;
  queryKey: /* existing */;
  queryFilter: /* existing */;

  /** Static (non-hook) query options for event handlers and prefetching */
  staticQueryOptions: keyof FunctionArgs<T> extends never
    ? (
        args?: EmptyObject | SkipToken,
        opts?: { skipUnauth?: boolean }
      ) => ConvexQueryOptions<T> & { meta: ConvexQueryMeta }
    : RequiredKeys<FunctionArgs<T>> extends never
      ? (
          args?: FunctionArgs<T> | SkipToken,
          opts?: { skipUnauth?: boolean }
        ) => ConvexQueryOptions<T> & { meta: ConvexQueryMeta }
      : (
          args: FunctionArgs<T> | SkipToken,
          opts?: { skipUnauth?: boolean }
        ) => ConvexQueryOptions<T> & { meta: ConvexQueryMeta };
};
```

### packages/kitcn/src/react/proxy.ts (imports)

Add `skipToken` import and `convexAction`:

```typescript
import { skipToken } from "@tanstack/react-query";
import { convexAction, convexQuery } from "../crpc/query-options";
```

## References

- Brainstorm: [2026-01-22-static-query-options-brainstorm.md](../brainstorms/2026-01-22-static-query-options-brainstorm.md)
- Existing pattern: [proxy.ts:100-122](../../packages/kitcn/src/react/proxy.ts#L100-L122)
- Non-hook function: [query-options.ts:24-60](../../packages/kitcn/src/crpc/query-options.ts#L24-L60)
- Types: [types.ts:191-216](../../packages/kitcn/src/crpc/types.ts#L191-L216)
