---
"kitcn": patch
---

## Patches

- Fix generated auth modules missing the internal `consumeOne` and `incrementOne` mutations that the Better Auth adapter calls. Rerun `kitcn codegen` and redeploy.
