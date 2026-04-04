---
"kitcn": patch
---

- Pin the scaffolded Zod install to the supported Zod 4 line so npm
  `kitcn init -t start` resolves without the peer conflict hit during release
  validation.
