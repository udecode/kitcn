---
"kitcn": patch
---

## Patches

- Fix `kitcn codegen` module parsing so project `tsconfig.json` path aliases
  like `@/lib/crpc` resolve during codegen.
- Fix `kitcn dev` and `kitcn codegen` parse-time env loading so Concave apps
  can read required values from the project root `.env`.
