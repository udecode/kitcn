# kitcn

kitcn is a framework and CLI for bootstrapping Convex-first application
surfaces. This context defines the product language for scaffold lanes and auth
surfaces so new integrations do not invent parallel contracts.

## Language

**Default auth scaffold**:
The first-class `kitcn add auth` capability that owns auth server, client,
provider, and managed schema refresh behavior.
_Avoid_: Standard auth, normal auth, main auth path

**Raw Convex auth preset**:
The conservative `kitcn add auth --preset convex` lane for plain Convex apps
that do not adopt the full kitcn auth surface.
_Avoid_: Convex auth parity, default auth

**Expo auth parity**:
Expo support that uses the **Default auth scaffold** product surface rather
than introducing an Expo-only auth contract.
_Avoid_: Expo auth preset, mobile-only auth mode

**Managed auth schema refresh**:
The `kitcn add auth --schema --yes` flow that refreshes auth-owned schema
blocks without rerunning the full auth install.
_Avoid_: auth regen, full auth rerun

**Auth demo route**:
The generated sign-in/sign-up screen owned by the **Default auth scaffold**.
_Avoid_: sample auth page, temporary auth UI

**Auth-aware provider wiring**:
Client provider wiring that mounts the auth-capable Convex provider rather than
the unauthenticated baseline provider.
_Avoid_: auth bootstrap only, runtime-only auth

**Generated auth contract**:
The kitcn backend auth model built around `auth.config.ts`, `auth.ts`,
`generated/auth`, and `kitcn/auth/http`.
_Avoid_: component auth model, manual createClient auth model

**Expo Better Auth client plugin**:
The Better Auth Expo client plugin and native storage setup used in Expo
clients.
_Avoid_: generic web auth client, browser-only auth client

## Relationships

- **Expo auth parity** reuses the **Default auth scaffold**
- **Expo auth parity** includes **Managed auth schema refresh**
- **Expo auth parity** includes an **Auth demo route**
- **Expo auth parity** includes **Auth-aware provider wiring**
- **Expo auth parity** uses the **Generated auth contract**
- **Expo auth parity** uses the **Expo Better Auth client plugin**
- **Raw Convex auth preset** is distinct from the **Default auth scaffold**
- The **Default auth scaffold** supports managed schema refresh via
  `kitcn add auth --schema`
- The **Raw Convex auth preset** does not use `--schema`; it refreshes by
  rerunning the full preset command
- The **Auth demo route** stays on `/auth` across first-class auth surfaces
- Protected route groups are not part of **Expo auth parity** v1

## Example dialogue

> **Dev:** "For Expo, should we add a mobile auth preset?"
> **Domain expert:** "No. Expo is **Expo auth parity**, which means the same
> **Default auth scaffold** surface. The separate lane is only the **Raw Convex
> auth preset**."

> **Dev:** "After changing auth plugins for Expo, do we rerun full install?"
> **Domain expert:** "No. Expo parity keeps **Managed auth schema refresh**,
> just like the **Default auth scaffold**."

> **Dev:** "Should Expo auth just wire the runtime and leave UI to users?"
> **Domain expert:** "No. **Expo auth parity** owns the **Auth demo route** and
> **Auth-aware provider wiring**, or parity means nothing."

> **Dev:** "Do we port the old component-style auth API from
> `convex-better-auth`?"
> **Domain expert:** "No. Expo parity keeps the **Generated auth contract**.
> `convex-better-auth` is the reference for native mechanics, not the public
> product model."

## Flagged ambiguities

- "Expo auth" was ambiguous between **Expo auth parity** and the
  **Raw Convex auth preset** — resolved: Expo uses **Expo auth parity**
- "`--schema` support" was ambiguous between optional convenience and product
  identity — resolved: it is part of **Expo auth parity** because Expo reuses
  the **Default auth scaffold**
- "Expo auth route" was ambiguous between generated UX and runtime-only wiring
  — resolved: **Expo auth parity** owns an **Auth demo route** at `/auth`
- "convex-better-auth as reference" was ambiguous between implementation donor
  and public contract — resolved: it informs native mechanics, while kitcn
  keeps the **Generated auth contract**
