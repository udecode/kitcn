---
"kitcn": patch
---

## Features

- Add `kitcn init -t start` for fresh TanStack Start apps.
- Add `kitcn/auth/start` and Start-specific auth scaffolding for `kitcn add auth`.

## Patches

- Fix generated file rewrites so unchanged codegen output does not trigger
  repeated TanStack Start reloads during local development.
- Pin the scaffolded Zod install to the supported Zod 4 line so npm
  `kitcn init -t start` resolves without the peer conflict hit during release
  validation.
