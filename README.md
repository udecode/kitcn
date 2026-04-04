# kitcn

Type-safe Convex framework with a tRPC-style server API, Drizzle-style ORM, and TanStack Query client integration.

## Docs

[kitcn.dev](https://kitcn.dev)

## What You Get

- cRPC procedure builder (`kitcn/server`)
- Drizzle-style ORM for Convex (`kitcn/orm`)
- React + TanStack Query integration with real-time updates (`kitcn/react`)
- Next.js server helpers for RSC/auth (`kitcn/auth/nextjs`, `kitcn/rsc`)
- Better Auth adapter utilities (`kitcn/auth`, `kitcn/auth/client`, `kitcn/auth/config`, `kitcn/auth/http`)
- Rate limiting plugin (`kitcn/ratelimit`)
- CLI with codegen, registry, runtime analysis (`kitcn` bin)

## Quick Start

```bash
npx kitcn@latest init -t next --yes
```

Then follow the [Quickstart](https://kitcn.dev/docs/quickstart).

## Local Dev

```bash
bun install
bun typecheck
bun run test
bun run lint
```

## Example App

The canonical reference app lives in [example](./example). It demonstrates current best-practice usage across auth, cRPC, ORM, HTTP routes, and TanStack Query.
