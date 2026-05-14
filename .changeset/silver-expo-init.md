---
"kitcn": minor
---

## Breaking changes

- Require Convex 1.38.0 or newer for generated apps and peer dependency checks.

```sh
# Before
bun add convex@1.36.1 kitcn

# After
bun add convex@1.38.0 kitcn
```

## Features

- Support IP-aware rate-limit scaffolds with Convex request metadata.

## Patches

- Support Expo app adoption and avoid Bun-only Expo scaffolding in npm-launched init flows.
- Document Convex request metadata for IP-aware rate-limit protection.
