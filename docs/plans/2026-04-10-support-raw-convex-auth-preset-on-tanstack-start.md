## Goal

Support `kitcn add auth --preset convex --yes` on TanStack Start.

## Why

- raw Convex auth preset already supports Next and Vite
- TanStack Start is already a detected shell
- current raw preset falls into generic React/Vite provider patching
- that path expects `main.tsx`, which Start does not have

## Acceptance

- raw preset succeeds on a TanStack Start shell
- it keeps raw Convex auth behavior:
  - no `kitcn.json`
  - no cRPC scaffold churn
  - no richer kitcn auth client surface
  - rerun full preset for schema refresh
- Start-specific files are scaffolded/patched:
  - `src/lib/convex/auth-client.ts`
  - `src/lib/convex/auth-server.ts`
  - `src/lib/convex/convex-provider.tsx`
  - `src/routes/api/auth/$.ts`
- provider patch does not require `main.tsx`
- CLI coverage proves the Start raw preset path

## Plan

1. Add a failing CLI test for raw Convex auth adoption on TanStack Start.
2. Add a raw Start fixture/helper if needed.
3. Patch raw preset plan selection so TanStack Start uses Start-specific auth files.
4. Run targeted CLI tests.
5. Run required repo gates for package/scaffold work:
   - `bun --cwd packages/kitcn build`
   - `bun lint:fix`
   - `bun typecheck`
   - `bun run fixtures:sync`
   - `bun run fixtures:check`
6. Update the active unreleased changeset.
