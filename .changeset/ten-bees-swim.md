---
"kitcn": patch
---

## Patches

- Fix `bunx --bun kitcn init -t start --yes` so Bun-native parse-time imports
  no longer bypass project aliases and crash first-run codegen on scaffolded
  Start files.
- Fix raw auth reruns so `http.ts` import detection respects both quote styles,
  `registerRoutes(http, getAuth, ...)` accepts Better Auth route contracts
  without a type cast, and raw auth clients keep the app `SITE_URL` while
  preserving user-edited raw `auth-client.ts` files on reruns.
