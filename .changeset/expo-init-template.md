---
"kitcn": patch
---

Add `kitcn init -t expo` for a fresh Expo scaffold built on the official
`create-expo-app` shell, including the Convex baseline, starter messages
screen, and first-class `kitcn add auth` parity on the Expo scaffold.

Expo local env now also owns `EXPO_PUBLIC_SITE_URL`, so Concave dev and Expo
auth keep one local app-origin contract instead of drifting back to
`http://localhost:3000`.
