---
"better-convex": minor
---

## Breaking changes

- Move TanStack React Query-dependent types from `better-convex/crpc` to `better-convex/react`

```ts
// Before
import type { CRPCClient, DecorateQuery, VanillaCRPCClient } from 'better-convex/crpc';

// After
import type { CRPCClient, DecorateQuery, VanillaCRPCClient } from 'better-convex/react';
```

Moved types: `CRPCClient`, `VanillaCRPCClient`, `DecorateQuery`, `DecorateMutation`, `DecorateAction`, `DecorateInfiniteQuery`, `ConvexQueryOptions`, `ConvexActionOptions`, `ConvexInfiniteQueryOptions`, `ConvexInfiniteQueryOptionsWithRef`, `InfiniteQueryOptsParam`, `VanillaQuery`, `VanillaMutation`, `VanillaAction`, `QueryOptsParam`, `QueryOptsReturn`, `ActionQueryOptsParam`, `ActionQueryOptsReturn`, `ReservedInfiniteQueryOptions`, `InfiniteQueryOptsReturn`

Framework-agnostic types (`ConvexQueryKey`, `ConvexQueryMeta`, `Meta`, `FnMeta`, etc.) remain in `better-convex/crpc`.

## Features

- Add `better-convex/solid` entry point for Solid.js support with `@tanstack/solid-query`
- Support CRPC proxy, ConvexQueryClient, auth store, query options, vanilla client, and hash utilities for Solid.js
- Add `@tanstack/solid-query` and `solid-js` as optional peer dependencies
- Make `@tanstack/react-query` an optional peer dependency
