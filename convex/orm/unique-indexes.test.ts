import {
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  text,
  uniqueIndex,
} from 'kitcn/orm';
import { describe, expect, it } from 'vitest';
import { withOrmCtx } from '../setup.testing';

let upsertUpdatedAtCalls = 0;

const uniqueUsers = convexTable(
  'unique_users',
  {
    email: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex('unique_email').on(t.email)]
);

const uniqueTeams = convexTable(
  'unique_teams',
  {
    tenantId: text().notNull(),
    email: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex('unique_tenant_email').on(t.tenantId, t.email)]
);

const upsertUsers = convexTable(
  'upsert_users',
  {
    email: text().notNull(),
    name: text().notNull(),
    updatedAt: text()
      .notNull()
      .$defaultFn(() => 'initial')
      .$onUpdateFn(() => {
        upsertUpdatedAtCalls += 1;
        return `updated_${upsertUpdatedAtCalls}`;
      }),
  },
  (t) => [uniqueIndex('unique_email').on(t.email)]
);

const rawSchema = {
  unique_users: uniqueUsers,
  unique_teams: uniqueTeams,
  upsert_users: upsertUsers,
};
const schema = defineSchema(rawSchema);
const relations = defineRelations(rawSchema);
const edges = extractRelationsConfig(relations);

const withCtx = async <T>(
  fn: (ctx: { orm: DatabaseWithMutations<typeof relations> }) => Promise<T>
) => withOrmCtx(schema, relations, async ({ orm }) => fn({ orm }));

describe('uniqueIndex enforcement', () => {
  it('rejects duplicate inserts', async () =>
    withCtx(async ({ orm }) => {
      await orm.insert(uniqueUsers).values({
        email: 'alice@example.com',
        name: 'Alice',
      });

      await expect(
        orm.insert(uniqueUsers).values({
          email: 'alice@example.com',
          name: 'Alice Duplicate',
        })
      ).rejects.toThrow(/unique/i);
    }));

  it('rejects updates that violate unique indexes', async () =>
    withCtx(async ({ orm }) => {
      const [first] = await orm
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const [second] = await orm
        .insert(uniqueUsers)
        .values({ email: 'bob@example.com', name: 'Bob' })
        .returning();

      await expect(
        orm
          .update(uniqueUsers)
          .set({ email: first.email })
          .where(eq(uniqueUsers.id, second.id))
          .returning()
      ).rejects.toThrow(/unique/i);
    }));

  it('allows onConflictDoNothing with unique indexes', async () =>
    withCtx(async ({ orm }) => {
      await orm
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const result = await orm
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoNothing({ target: uniqueUsers.email })
        .returning();

      expect(result).toHaveLength(0);
    }));

  it('allows onConflictDoNothing without target (any unique conflict)', async () =>
    withCtx(async ({ orm }) => {
      await orm
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const result = await orm
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoNothing()
        .returning();

      expect(result).toHaveLength(0);
    }));

  it('allows onConflictDoUpdate with unique indexes', async () =>
    withCtx(async ({ orm }) => {
      await orm
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const [updated] = await orm
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoUpdate({
          target: uniqueUsers.email,
          set: { name: 'Updated' },
        })
        .returning();

      expect(updated.name).toBe('Updated');
    }));

  it('applies $onUpdateFn during onConflictDoUpdate when not set', async () =>
    withCtx(async ({ orm }) => {
      upsertUpdatedAtCalls = 0;

      const [created] = await orm
        .insert(upsertUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      expect(created.updatedAt).toBe('initial');

      const [updated] = await orm
        .insert(upsertUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoUpdate({
          target: upsertUsers.email,
          set: { name: 'Updated' },
        })
        .returning();

      expect(upsertUpdatedAtCalls).toBe(1);
      expect(updated.updatedAt).toBe('updated_1');
    }));

  it('enforces composite unique indexes', async () =>
    withCtx(async ({ orm }) => {
      await orm
        .insert(uniqueTeams)
        .values({ tenantId: 't1', email: 'alice@example.com', name: 'Alice' })
        .returning();

      await orm
        .insert(uniqueTeams)
        .values({ tenantId: 't2', email: 'alice@example.com', name: 'Alice' })
        .returning();

      await expect(
        orm.insert(uniqueTeams).values({
          tenantId: 't1',
          email: 'alice@example.com',
          name: 'Alice Duplicate',
        })
      ).rejects.toThrow(/unique/i);
    }));
});
