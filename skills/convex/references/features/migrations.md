# Migrations Reference

Built-in online data migrations for better-convex. Prerequisites: `setup/server.md`.

## When to Migrate

Convex is not SQL — skip migrations for backward-compatible changes.

**Skip migrations:**
- Adding optional fields
- Adding new tables or indexes
- Code-level defaults on read (`doc.field ?? 'default'`)
- Keeping deprecated fields while new code rolls out

**Use migrations:**
- Optional → required (field must exist on every row)
- Type or enum narrowing
- Field rename or removal that would violate schema
- Semantic rewrites or one-time backfills

**Rule:** Old docs still pass schema + app logic → no migration. Old docs would fail → migrate.

## Core API

### `defineMigration`

```ts
import { defineMigration } from 'better-convex/orm';

export const migration = defineMigration({
  id: '20260227_080239_backfill_todo_priority', // timestamped unique id
  description: 'backfill todo priority',         // optional
  up: {
    table: 'todos',
    migrateOne: async (_ctx, doc) => {
      if (doc.priority === undefined || doc.priority === null) {
        return { priority: 'medium' }; // partial patch
      }
      // return nothing to skip
    },
  },
  down: { // optional — omit if not safely reversible
    table: 'todos',
    migrateOne: async (_ctx, doc) => {
      if (doc.priority === 'medium') {
        return { priority: undefined };
      }
    },
  },
});
```

### MigrationStep Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `table` | `string` | — | Table to iterate |
| `migrateOne` | `(ctx, doc) => patch \| void` | — | Per-document transform |
| `batchSize` | `number` | `128` (runtime) / `256` (CLI) | Docs per batch |
| `writeMode` | `'safe_bypass' \| 'normal'` | `'safe_bypass'` | Bypass or run ORM rules/triggers |

### `migrateOne` Context

| Field | Type | Description |
|-------|------|-------------|
| `db` | `DatabaseWriter` | Raw Convex database writer |
| `orm` | `OrmWriter` | ORM writer for complex ops |
| `migrationId` | `string` | Current migration id |
| `runId` | `string` | Current run id |
| `direction` | `'up' \| 'down'` | Current direction |
| `dryRun` | `boolean` | Whether dry run |
| `writeMode` | `'safe_bypass' \| 'normal'` | Current write mode |

### `defineMigrationSet`

Auto-generated manifest. Collects migrations, computes checksums, sorts by id:

```ts
import { defineMigrationSet } from 'better-convex/orm';
export const migrations = defineMigrationSet([migration1, migration2]);
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `migrate create <name>` | Scaffold timestamped migration + update manifest |
| `migrate up [--prod]` | Apply all pending migrations in order |
| `migrate down --steps N [--prod]` | Roll back N migrations |
| `migrate down --to <id> [--prod]` | Roll back to specific migration |
| `migrate status [--prod]` | Show applied/pending/drift state |
| `migrate cancel [--prod]` | Cancel active run |

## Deploy Integration

`better-convex deploy` auto-runs: `convex deploy` → `migrate up` → `aggregate backfill`.

Config in `better-convex.json`:

```json
{
  "deploy": {
    "migrations": {
      "enabled": "auto",
      "wait": true,
      "batchSize": 256,
      "pollIntervalMs": 1000,
      "timeoutMs": 900000,
      "strict": true,
      "allowDrift": false
    }
  }
}
```

`better-convex dev` uses relaxed defaults (`strict: false`, `allowDrift: true`).

## Drift Safety

Applied migrations are immutable. Two drift checks:

| Drift | Cause | Effect |
|-------|-------|--------|
| Checksum mismatch | Applied migration file edited | Blocks next run |
| Missing from manifest | Applied migration deleted | Blocks next run |

`allowDrift` is emergency-only. Create new migrations for follow-up behavior.

## Internal Tables

- `migration_state` — applied checksums and progress per migration
- `migration_run` — run lifecycle (start, status, failures)

Reserved names — do not create tables with these names.

## Runtime Statuses

`pending` → `running` → `completed` | `failed` | `canceled` | `dry_run` | `noop` | `drift_blocked`

## Best Practices

1. **One migration per schema change** — don't bundle unrelated backfills.
2. **Codegen before migrate up** — deterministic order prevents stale function code.
3. **`safe_bypass` by default** — bypasses ORM rules/triggers for speed. Set `writeMode: 'normal'` when you need hooks.
4. **Don't edit applied migrations** — triggers checksum drift. Create new migration instead.
5. **Prefer code defaults** — `doc.field ?? 'default'` over migration when backward-compatible.

## Common Workflow: Optional → Required

1. `migrate create backfill_field`
2. Implement `migrateOne` to fill missing values
3. `codegen` then `migrate up`
4. Harden schema (`.notNull()`)
5. `codegen` to confirm

## Related References

- ORM: `./orm.md`
- Triggers: docs at `/docs/orm/schema/triggers`
- CLI: docs at `/docs/cli`
