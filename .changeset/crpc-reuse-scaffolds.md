---
'better-convex': major
---

Resend scaffolds now reuse project cRPC builders from `convex/<paths.lib>/crpc.ts` instead of creating local `initCRPC.create()` instances.

- `convex/functions/plugins/resend.ts` imports `privateMutation`, `privateQuery`, and `privateAction` from project `crpc.ts`.
- `convex/functions/plugins/email.tsx` imports `privateAction` from project `crpc.ts`.
- `convex/lib/plugins/resend/webhook.ts` imports `publicRoute` from project `crpc.ts`.

This keeps plugin procedure wiring consistent with app-level cRPC setup and removes duplicated local cRPC factory boilerplate in scaffolded plugin files.
