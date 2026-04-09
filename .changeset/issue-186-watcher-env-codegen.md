---
"kitcn": patch
---

## Patches

- Fix `kitcn dev` watcher codegen so Convex parse-time imports read local env
  values from `.env` and `convex/.env`, matching the initial codegen path.
- Ignore watcher-owned `*.kitcn-parse.ts` temp files during `kitcn dev` so
  parse-time source rewrites do not retrigger codegen in a save loop.
- Add server-only middleware procedure info for logging and tracing. Standard
  `export const` queries, mutations, and actions infer `module:function`
  automatically through app `generated/server`; `.name("module:function")`
  overrides when needed, and HTTP routes expose route method and path
  automatically.
- Add `requireSchedulerCtx()` for mutation-or-action scheduling flows so auth
  callbacks and other generic ctx paths can enqueue work without lying about
  action context.
