---
module: kitcn/server
date: 2026-01-22
problem_type: feature_request
component: middleware_system
severity: medium
symptoms:
  - Middleware couldn't access parsed input data
  - Verbose workarounds required for session tracking (50+ lines)
  - No type-safe input access in middleware
root_cause: Middleware execution passed only context without input. tRPC-style pattern was missing.
tags:
  - middleware
  - input-access
  - type-safety
  - tRPC-compatible
  - enhancement
related:
  - /docs/server/middlewares
  - /docs/server/context
  - PR #39
---

# Middleware Input Access (tRPC-style)

Add `input` and `getRawInput` to middleware options. Middleware after `.input()` receives typed input; before receives `unknown`.

## Problem

Middleware couldn't access parsed input. Session tracking required 50+ line workarounds.

## Solution

### Type Changes (`types.ts`)

```typescript
export type GetRawInputFn = () => Promise<unknown>;

export type MiddlewareFunction<
  TContext,
  TMeta,
  TContextOverridesIn,
  $ContextOverridesOut,
  TInputOut = unknown,  // NEW
> = (opts: {
  ctx: Simplify<Overwrite<TContext, TContextOverridesIn>>;
  meta: TMeta;
  input: TInputOut;           // NEW
  getRawInput: GetRawInputFn; // NEW
  next: MiddlewareNext<TContextOverridesIn>;
}) => Promise<MiddlewareResult<$ContextOverridesOut>>;
```

### Input Type Inference (`builder.ts`)

```typescript
type InferMiddlewareInput<T> = T extends UnsetMarker
  ? unknown
  : T extends z.ZodObject<any>
    ? z.infer<T>
    : unknown;
```

### Runtime Execution

```typescript
async function executeMiddlewares(
  middlewares: AnyMiddleware[],
  ctx: unknown,
  meta: unknown,
  input: unknown,
  getRawInput: GetRawInputFn,
  index = 0
): Promise<MiddlewareExecutionResult> {
  if (index >= middlewares.length) {
    return { marker: undefined as never, ctx, input };
  }

  const middleware = middlewares[index];
  let currentInput = input;

  const next = async (opts?: { ctx?: unknown; input?: unknown }) => {
    const nextCtx = opts?.ctx ?? ctx;
    const nextInput = opts?.input ?? currentInput;
    if (opts?.input !== undefined) currentInput = opts.input;
    return executeMiddlewares(middlewares, nextCtx, meta, nextInput, getRawInput, index + 1);
  };

  const result = await middleware({ ctx, meta, input, getRawInput, next });
  return { marker: undefined as never, ctx: result.ctx ?? ctx, input: currentInput };
}
```

## Usage

### Middleware After `.input()` - Typed

```typescript
publicQuery
  .input(z.object({ id: zid('user') }))
  .use(async ({ input, next }) => {
    const id: Id<'user'> = input.id; // Typed!
    return next();
  })
```

### Middleware Before `.input()` - Unknown

```typescript
publicQuery
  .use(async ({ input, next }) => {
    const _unknownInput: unknown = input;
    return next();
  })
  .input(z.object({ id: zid('user') }))
```

### Modify Input in next()

```typescript
publicQuery
  .input(z.object({ projectId: zid('projects'), name: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const project = await ctx.db.get(input.projectId);
    return next({
      ctx: { ...ctx, project },
      input: { ...input, project, name: input.name.trim() }
    });
  })
```

### Session Pattern (Real-World)

```typescript
publicQuery
  .input(z.object({ sessionId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    const session = await getSession(ctx, input.sessionId);
    if (!session) throw new CRPCError({ code: 'UNAUTHORIZED' });
    return next({ ctx: { ...ctx, session } });
  })
```

## Files Modified

| File | Changes |
|------|---------|
| `types.ts` | `TInputOut` generic, `GetRawInputFn`, `MiddlewareNext` |
| `builder.ts` | `InferMiddlewareInput`, `executeMiddlewares` |
| `http-builder.ts` | HTTP middleware with input tracking |
| `crpc-test.ts` | Section 22 tests (22.1-22.11) |
| `middlewares.mdx` | Documentation |

## Prevention

- Use typed input only after `.input()` call
- Use `getRawInput()` for raw access before validation
- Existing middleware without input destructuring works unchanged
