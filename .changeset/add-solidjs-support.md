---
"better-convex": minor
---

## Features

- Add SolidJS flavor with full feature parity to React integration
- Add `ConvexProvider`, `ConvexProviderWithAuth`, `useConvex`, and `useConvexAuth` for SolidJS
- Add `createConvexQueryClient` and `useConvexQuery` bridging Convex subscriptions to TanStack Solid Query
- Add cRPC layer for SolidJS with typed query/mutation/action proxies
- Add `useConvexInfiniteQuery` for paginated queries in SolidJS
- Add `createConvexHTTPProxy` for SSR-compatible HTTP client in SolidJS
- Add auth mutation helpers (`useSignIn`, `useSignUp`, `useSignOut`) for SolidJS
- Add `useRateLimit` hook for SolidJS using `client.onUpdate()` subscriptions
- Add `./solid` and `./plugins/ratelimit/solid` package exports
