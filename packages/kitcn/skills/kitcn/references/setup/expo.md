# Expo Setup

Use Expo when you want the official `create-expo-app` shell with the kitcn
Convex baseline layered on top.

## Fresh scaffold

```bash
npx kitcn@latest init -t expo --yes
```

This path owns:

- `.env.local`
- `expo-env.d.ts`
- `src/components/providers.tsx`
- `src/lib/convex/*`
- `src/app/_layout.tsx`
- `src/app/index.tsx`
- `convex/functions/schema.ts`
- `convex/functions/messages.ts`
- `convex/lib/crpc.ts`
- `convex/lib/get-env.ts`
- `convex/shared/api.ts`

V1 scope stays narrow:

- fresh scaffold only
- no existing Expo adoption
- no styling-framework layer beyond the official Expo baseline

## Add auth

Expo uses the default auth scaffold:

```bash
npx kitcn@latest init -t expo --yes
npx kitcn add auth --yes
npx kitcn add auth --schema --yes
```

This writes:

- `src/lib/convex/auth-client.ts`
- `src/lib/convex/convex-provider.tsx`
- `src/app/auth.tsx`
- `convex/functions/auth.config.ts`
- `convex/functions/auth.ts`
- auth-owned blocks in `convex/functions/schema.ts`

Expo auth keeps managed schema refresh. It is not a separate preset.

## Env contract

```bash
EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
EXPO_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211
EXPO_PUBLIC_SITE_URL=http://localhost:3000
```

Use `process.env.EXPO_PUBLIC_*` directly in client code.

## Run it

```bash
# terminal 1
npx kitcn dev

# terminal 2
bun run start
```

The starter app opens to one native messages screen backed by Convex.
