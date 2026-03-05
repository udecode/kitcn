---
"better-convex": patch
---

Fix `createEnv` throwing "Invalid environment variables" during `better-convex dev`. The CLI now sets a `globalThis.__BETTER_CONVEX_CODEGEN__` sentinel before importing Convex files via jiti, and `createEnv` reads that sentinel (instead of `process.env`) to activate a safe fallback — using `options[0]` for `z.enum` fields instead of `""` to avoid false validation failures.
