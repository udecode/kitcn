---
"kitcn": patch
---

## Patches

- Fix Resend scaffolds to resolve optional Resend env values from Convex runtime env proxies.
- Fix Resend env helper reruns to update noncanonical `createEnv` formatting instead of silently skipping `readOptionalRuntimeEnv`.
- Fix env helper reruns to fail loudly instead of duplicating or rewriting non-literal `readOptionalRuntimeEnv` options.
- Fix Resend scaffold table names to match the camelCase schema extension keys.
