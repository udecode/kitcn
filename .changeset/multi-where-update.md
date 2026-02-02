---
"better-convex": patch
---

Support multiple WHERE conditions in `update()` for Better Auth organization plugin compatibility.

- Multiple AND conditions with equality checks now work
- Validates exactly 1 document matches before updating (prevents accidental bulk updates)
- OR conditions and non-eq operators still require `updateMany()`
