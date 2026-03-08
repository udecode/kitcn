---
"better-convex": patch
---

Support loading ORM triggers from `triggers.ts` during codegen, with fallback to `schema.ts` for backward compatibility. This keeps `schema.ts` schema-safe when triggers need generated runtime helpers like `createXCaller(...)`.
