# kitcn

Type-safe Convex framework with a tRPC-style server API, Drizzle-style ORM, and TanStack Query client integration.

> Note: `better-convex` has been renamed to `kitcn`.

## Docs

[kitcn.dev](https://kitcn.dev)

## What You Get

- cRPC procedure builder (`kitcn/server`)
- Drizzle-style ORM for Convex (`kitcn/orm`)
- React + TanStack Query integration with real-time updates (`kitcn/react`)
- Next.js server helpers for RSC/auth (`kitcn/auth/nextjs`, `kitcn/rsc`)
- Better Auth adapter utilities (`kitcn/auth`, `kitcn/auth/client`, `kitcn/auth/config`, `kitcn/auth/http`)
- CLI metadata/codegen/runtime analysis helpers (`kitcn` bin)

## Quick Start

```bash
bun add convex kitcn zod @tanstack/react-query
```

Then follow:

- [Quickstart](https://kitcn.dev/docs/quickstart)
- [Templates](https://kitcn.dev/docs/templates)

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
