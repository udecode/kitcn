# Expo auth uses the default auth scaffold, not a separate Expo preset

Expo auth support will reuse the default `kitcn add auth` product surface,
including `/auth` demo route ownership, auth-aware provider wiring, and
`--schema` refresh. We explicitly rejected a separate Expo-only auth lane even
though `../convex-better-auth` has Expo-specific mechanics, because that repo is
the implementation reference for native behavior, not the public product model.
