---
"kitcn": minor
"@kitcn/resend": minor
---

## Breaking changes

- Require Convex 1.35 or newer.

```json
// Before
{ "convex": "1.33.0" }

// After
{ "convex": "1.35.1" }
```

## Patches

- Let Convex handle anonymous non-interactive local setup without forcing `CONVEX_AGENT_MODE`.
- Support Convex `dev --start` as a pre-run conflict flag.
