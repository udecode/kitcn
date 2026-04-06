---
"kitcn": patch
---

## Patches

- Fix Concave local `kitcn dev` schema watches so `schema.ts` edits rerun fresh codegen and refresh generated schema outputs without a manual `kitcn codegen`.
- Fix `count()` and aggregate range filters on `timestamp({ mode: "string" })`
  aggregateIndex suffix fields so stored millis buckets match ISO-string
  filters instead of silently returning zero.
- Add `kitcn auth jwks` for manual static JWKS export and key rotation when a
  deployment cannot use the Convex-only `env push` flow.
