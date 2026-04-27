---
"kitcn": minor
"@kitcn/resend": minor
---

## Breaking changes

- Require Convex 1.36 or newer.

```bash
# Before
bun add convex@1.35.1

# After
bun add convex@1.36.1
```

## Features

- Add `kitcn env default` passthrough for Convex default environment variables.

## Patches

- Align Better Auth scaffolds and auth runtime helpers with Better Auth 1.6.9.
- Document Convex inline query, branch deployment, deploy message, and preview deployment passthroughs.
