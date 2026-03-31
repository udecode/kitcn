---
"kitcn": patch
---

## Patches

- Fix fresh `bunx kitcn init` installs so the published CLI ships its runtime
  TypeScript dependency instead of failing before scaffold setup starts.
- Fix `kitcn init -t next --yes` so non-interactive local bootstrap provisions
  an anonymous Convex deployment instead of stopping on a login prompt.
