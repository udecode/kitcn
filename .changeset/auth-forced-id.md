---
"kitcn": patch
---

## Patches

- Fix Better Auth creates that carry their own id (`forceAllowId`) failing with ``Unexpected field `_id` ``: organization invitations on Better Auth 1.7.16 with default options, and `reserveVerificationValue` (magic link and email OTP for unverified users, SIWE, SAML). The row now gets its Convex id, and Better Auth reads it back under that id.
