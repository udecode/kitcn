# Let Better Auth creates with a forced id work on Convex

Status: building: branch fix/auth-forced-id on the EfficiencyCorp fork, PR not opened yet
Playbook: bug-fix

## Brief

### What will change?

Better Auth creates that bring their own id stop failing. Organization invitations on Better Auth 1.7.16 and reserved verification values get a Convex id, and Better Auth reads the row back under it.

### What could go wrong?

Better Auth's single-use checks rely on the database rejecting a second row with the same id. Convex picks its own ids, so a replayed SAML assertion or client assertion is no longer caught there.

## Teach

Better Auth asks its adapter to create rows. Usually it leaves the id to the database, but some calls force one: organization invitations on Better Auth 1.7.16 and reserved verification values, such as the lock a magic link takes for an unverified user.

Convex always picks a document's id itself and rejects a row that names one. So every forced-id create failed with a server error, and invite-member broke for every app on Better Auth 1.7.16 with default options.

The create path now drops the forced id, lets Convex pick one, and returns the row under that id, which is the id Better Auth uses from then on.

## Main changes

- `createHandler` in `packages/kitcn/src/auth/create-api.ts` drops `_id` from the create input before the `create.before` trigger, the unique-field check and the insert. Every adapter create reaches it through the generated `create` mutation, from both `httpAdapter` and `dbAdapter`.
- The returned row already carries the Convex `_id` and `id`; Better Auth's output mapping reads `_id` as `id`, so the invitation and verification rows read back under their Convex ids.

## Defaults

| Decision | Pick | Alternative | Word | Impact |
| --- | --- | --- | --- | --- |
| Forced ids on Convex | Drop the forced id and keep the Convex one (look) | Store the forced id in an extra column so single-use checks stay enforced | keep forced ids | big |
| Better Auth version in tests | Run the tests on the pinned Better Auth 1.7.1, plus a manual run on 1.7.16 | Raise the pinned Better Auth to 1.7.16 in this change | pin 1.7.16 | small |
| Validated auth input | Leave the opt-in typed input check alone | Let that check accept a forced id too | validate forced ids | small |

## Steps

- [x] Reproduce: a forced-id create through the generated auth functions fails with ``Unexpected field `_id` ``. Proof: `bunx vitest run packages/kitcn/src/auth/forced-id.vitest.ts` at base, 1 of 2 red on the 1.7.1 pin and 2 of 2 red on 1.7.16.
- [x] Fix `createHandler`. Proof: the same file, 2 of 2 green on 1.7.1 and on 1.7.16.
- [x] Docs: the Document IDs section in `www/content/docs/auth/server.mdx` and its line in `packages/kitcn/skills/kitcn/references/features/auth.md`. Proof: both pages read the same contract.
- [x] Changeset `.changeset/auth-forced-id.md` (patch). Proof: the file exists.
- [ ] Review panel and land through `land.mjs`. Proof: the PR's checks.

## Verification

- `packages/kitcn/src/auth/forced-id.vitest.ts` runs Better Auth with the organization plugin on `httpAdapter` over convex-test and the real generated auth functions: invite-member with default options, then list-invitations returns the invitation under the id invite-member returned; `reserveVerificationValue` returns true and stores the row.
- On the pinned Better Auth 1.7.1 the reservation test fails without the fix; invite-member sends no forced id there, so that test guards Better Auth 1.7.16 and later. A throwaway clone with Better Auth 1.7.16 ran both red at base and green with the fix.
- `bun test` on the auth create, factory and adapter suites passes (86 tests), and the package typechecks.

## Open work

- Single-use checks keyed by a derived id (`reserveVerificationValue`, SAML assertion ids, `private_key_jwt` assertions) are not enforced by Convex. Owner: kitcn maintainers. Stop: a decision on storing forced ids.
- Raising the pinned Better Auth past 1.7.1 is a separate change. Owner: kitcn maintainers.
