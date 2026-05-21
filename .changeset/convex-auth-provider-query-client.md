---
"kitcn": patch
---

## Features

- Support syncing shared Convex query clients directly from `ConvexAuthProvider`.

## Patches

- Keep the existing auth store attached when reusing a Convex query client before `ConvexAuthProvider` resyncs it.
- Fix `kitcn/auth/start/server` so Nitro production builds can trace and include the TanStack Start server dependency without making `kitcn/auth/start` unsafe for browser loaders.
