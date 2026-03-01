---
"better-convex": patch
---

## Patches

- Fix nested `arrayOf(objectOf(...))` field nullability so `text()` and `text().notNull()` produce distinct schema/data-model types and avoid deploy mismatches.
