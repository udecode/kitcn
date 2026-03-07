import { text } from './builders/text';
import { createOrm, getResetTableNames } from './create-orm';
import { defineSchemaExtension } from './extensions';
import { defineMigration, defineMigrationSet } from './migrations/definitions';
import { defineRelations } from './relations';
import { defineSchema } from './schema';
import { OrmContext } from './symbols';
import { convexTable } from './table';

function ratelimitExtension() {
  return defineSchemaExtension('ratelimit', {
    ratelimitState: convexTable('ratelimit_state', {
      name: text().notNull(),
    }),
    ratelimitDynamicLimit: convexTable('ratelimit_dynamic_limit', {
      prefix: text().notNull(),
    }),
    ratelimitProtectionHit: convexTable('ratelimit_protection_hit', {
      value: text().notNull(),
    }),
  });
}

const createReader = () =>
  ({
    query: () => ({}),
    system: {},
  }) as any;

describe('createOrm type adapters', () => {
  const users = convexTable('users_mode_test', {
    name: text().notNull(),
  });
  const tables = { users };
  const schema = defineRelations(defineSchema(tables));

  test('does not attach global date mode in orm context', () => {
    const orm = createOrm({ schema });
    const db = orm.db(createReader()) as any;

    expect(db[OrmContext]).toBeDefined();
    expect(Object.hasOwn(db[OrmContext], 'types')).toBe(false);
    expect(db[OrmContext].resolvedDefaults).toMatchObject({
      countBackfillBatchSize: 1000,
      relationFanOutMaxKeys: 1000,
      mutationBatchSize: 400,
      mutationLeafBatchSize: 1600,
      mutationMaxRows: 10000,
      mutationMaxBytesPerBatch: 2_097_152,
      mutationScheduleCallCap: 800,
      mutationExecutionMode: 'sync',
      mutationAsyncDelayMs: 0,
    });
  });

  test('resolves async mutation mode when scheduling is wired', () => {
    const orm = createOrm({ schema });
    const db = orm.db(
      { db: createReader(), scheduler: {} as any },
      { scheduledMutationBatch: {} as any }
    ) as any;

    expect(db[OrmContext].resolvedDefaults.mutationExecutionMode).toBe('async');
  });

  test('orm.api exposes migration procedures when migrations are configured', () => {
    const migrationSet = defineMigrationSet<typeof schema>([
      defineMigration({
        id: '20260227_users_name',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);
    const orm = createOrm({
      schema,
      ormFunctions: {
        scheduledMutationBatch: {} as any,
        scheduledDelete: {} as any,
      },
      migrations: migrationSet,
    });

    const api = orm.api();
    expect(api).toHaveProperty('migrationRun');
    expect(api).toHaveProperty('migrationRunChunk');
    expect(api).toHaveProperty('migrationStatus');
    expect(api).toHaveProperty('migrationCancel');
  });

  test('getResetTableNames includes migration and aggregate internal tables by default', () => {
    const tableNames = getResetTableNames(schema);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('migration_state');
    expect(tableNames).toContain('migration_run');
    expect(tableNames).toContain('aggregate_state');
    expect(tableNames).not.toContain('ratelimitState');
    expect(tableNames).not.toContain('ratelimitDynamicLimit');
    expect(tableNames).not.toContain('ratelimitProtectionHit');
  });

  test('getResetTableNames includes ratelimit internal tables when ratelimitExtension is enabled', () => {
    const pluginUsers = convexTable('users_mode_test_plugin', {
      name: text().notNull(),
    });
    const pluginTables = { pluginUsers };
    const pluginSchema = defineRelations(
      defineSchema(pluginTables).extend(ratelimitExtension())
    );
    const tableNames = getResetTableNames(pluginSchema);

    expect(tableNames).toContain('ratelimitState');
    expect(tableNames).toContain('ratelimitDynamicLimit');
    expect(tableNames).toContain('ratelimitProtectionHit');
  });
});
