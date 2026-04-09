---
title: Middleware logging should use server-only procedure info
date: 2026-04-09
category: best-practices
module: kitcn/server
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - reusable middleware needs a stable procedure identity for logging or tracing
  - procedure names should stay off client-visible generated metadata
  - HTTP routes and cRPC procedures should expose one middleware logging shape
tags: [middleware, logging, tracing, crpc, http, procedure-info, meta]
---

# Middleware logging should use server-only procedure info

## Context

Reusable middleware could already measure duration, but it had no clean
server-only place to read procedure identity.

The tempting workaround was `.meta({ logName: ... })`. That works, but it is
the wrong seam because `.meta(...)` is generated into client-visible API
metadata.

## Guidance

Use middleware `procedure` info for logging and tracing.

- `procedure.type` is always available.
- Standard `export const` queries, mutations, and actions should infer
  `procedure.name` automatically when they are built from the app
  `generated/server` helper.
- Use `.name("module:function")` only to override the inferred name or cover
  unusual export shapes.
- HTTP routes should derive `procedure.name`, `procedure.method`, and
  `procedure.path` from the route automatically.
- Keep `.meta(...)` for client-visible behavior, not server-only logging data.

## Why This Matters

Convex root query/mutation/action handlers do not expose their function path on
the runtime ctx, and raw `queryGeneric(...)` / `mutationGeneric(...)` exports do
not carry `Symbol.for("functionName")` automatically.

That means runtime reflection from Convex ctx is the wrong seam. The honest fix
is server-only procedure info with automatic inference from the exported
callsite, plus an explicit override for the odd cases that inference cannot
prove safely.

## When to Apply

- logging middleware
- tracing middleware
- audit middleware that tags entries with procedure identity
- shared middleware used across both cRPC procedures and HTTP routes

## Examples

Before, the only clean built-in signal was duration:

```ts
const logMiddleware = c.middleware(async ({ ctx, next }) => {
  const start = Date.now();
  try {
    return await next({ ctx });
  } finally {
    console.log(`${Date.now() - start}ms`);
  }
});
```

After, middleware can log stable server-only procedure info:

```ts
const logMiddleware = c.middleware(async ({ ctx, procedure, next }) => {
  const start = Date.now();
  try {
    return await next({ ctx });
  } finally {
    console.log(`[${procedure.name ?? procedure.type}] ${Date.now() - start}ms`);
  }
});

export const listPosts = c.query
  .use(logMiddleware)
  .query(async ({ ctx }) => {
    return ctx.orm.query.posts.findMany({ limit: 50 });
  });
```

HTTP routes get route info automatically:

```ts
const routeLog = c.middleware(async ({ ctx, procedure, next }) => {
  const start = Date.now();
  try {
    return await next({ ctx });
  } finally {
    console.log(`[${procedure.name}] ${Date.now() - start}ms`);
  }
});

export const listPosts = c.httpAction
  .get("/posts")
  .use(routeLog)
  .query(async () => ({ ok: true }));
```

## Related

- [Middleware Input Access (tRPC-style)](../patterns/middleware-input-access-trpc-style.md)
- [Shared middleware must carry only context deltas across query and mutation chains](../logic-errors/shared-middleware-must-carry-only-context-delta-20260407.md)
