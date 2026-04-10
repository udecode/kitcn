---
"kitcn": patch
---

## Patches

- Improve TanStack Start auth migration docs and clarify the `kitcn add auth --schema --yes` schema refresh flow.
- Fix the Next.js auth proxy so POST auth errors return the upstream response instead of crashing with a 500.
- Fix `kitcn dev` local bootstrap so older local Convex backends auto-upgrade without hanging on a non-interactive prompt.
