---
"better-convex": patch
---

Pass the Convex deployment URL through the SSR server caller instead of falling back to `NEXT_PUBLIC_CONVEX_URL`.

`createCallerFactory` now derives the `.convex.cloud` URL from `convexSiteUrl` by default and also accepts an explicit `convexUrl` override for frameworks that do not use Next.js env naming.
