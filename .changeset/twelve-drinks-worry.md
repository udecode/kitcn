---
"better-convex": minor
---

Add strict `paths.env` scaffold enforcement for plugin templates.

- When `meta["better-convex"].paths.env` is configured, scaffold generation now fails if any resolved scaffold file still contains `process.env`.
- Resend scaffolds now use `getEnv()` for `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `RESEND_FROM_EMAIL` when `paths.env` is configured.
- This removes scaffold-level fallback casting and enforces explicit env-schema ownership in projects using `paths.env`.
