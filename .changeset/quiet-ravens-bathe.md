---
"kitcn": patch
---

## Patches

- Fix fresh `bunx kitcn` installs so the CLI keeps TypeScript off the cold
  startup path and still boots when Bun omits `typescript` from the transient
  install tree.
