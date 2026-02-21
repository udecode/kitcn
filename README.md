# Better Convex

Type-safe Convex framework with a tRPC-style server API, Drizzle-style ORM, and TanStack Query client integration.

## Docs

[better-convex.com](https://better-convex.com)

## What You Get

- cRPC procedure builder (`better-convex/server`)
- Drizzle-style ORM for Convex (`better-convex/orm`)
- React + TanStack Query integration with real-time updates (`better-convex/react`)
- Next.js server helpers for RSC/auth (`better-convex/auth/nextjs`, `better-convex/rsc`)
- Better Auth adapter utilities (`better-convex/auth`, `better-convex/auth/client`, `better-convex/auth/config`, `better-convex/auth/http`)
- CLI metadata/codegen helpers (`better-convex` bin)

## Quick Start

```bash
bun add convex better-convex zod @tanstack/react-query
```

Then follow:

- [Quickstart](https://better-convex.com/docs/quickstart)
- [Templates](https://better-convex.com/docs/templates)

## Local Dev

```bash
bun install
bun typecheck
bun run test
bun run lint
```

## Example App

The canonical reference app lives in:

- [example](./example)

It demonstrates current best-practice usage across auth, cRPC, ORM, HTTP routes, and TanStack Query.
