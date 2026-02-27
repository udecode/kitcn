import { v } from 'convex/values';
import { boolean, custom, integer, text } from '../builders';
import { index } from '../indexes';
import type { OrmSchemaPlugin } from '../symbols';
import { convexTable } from '../table';

export const MIGRATION_STATE_TABLE = 'migration_state';
export const MIGRATION_RUN_TABLE = 'migration_run';

export const migrationStateTable = convexTable(
  MIGRATION_STATE_TABLE,
  {
    migrationId: text().notNull(),
    checksum: text().notNull(),
    applied: boolean().notNull(),
    status: text().notNull(),
    direction: text(),
    runId: text(),
    cursor: text(),
    processed: integer().notNull(),
    startedAt: integer(),
    updatedAt: integer().notNull(),
    completedAt: integer(),
    lastError: text(),
    writeMode: text().notNull(),
  },
  (t) => [
    index('by_migration_id').on(t.migrationId),
    index('by_status').on(t.status),
  ]
);

export const migrationRunTable = convexTable(
  MIGRATION_RUN_TABLE,
  {
    runId: text().notNull(),
    direction: text().notNull(),
    status: text().notNull(),
    dryRun: boolean().notNull(),
    allowDrift: boolean().notNull(),
    migrationIds: custom(v.array(v.string())).notNull(),
    currentIndex: integer().notNull(),
    startedAt: integer().notNull(),
    updatedAt: integer().notNull(),
    completedAt: integer(),
    cancelRequested: boolean().notNull(),
    lastError: text(),
  },
  (t) => [index('by_run_id').on(t.runId), index('by_status').on(t.status)]
);

export const migrationStorageTables = {
  [MIGRATION_STATE_TABLE]: migrationStateTable,
  [MIGRATION_RUN_TABLE]: migrationRunTable,
} as const;

export const MIGRATION_STORAGE_TABLE_NAMES = new Set([
  MIGRATION_STATE_TABLE,
  MIGRATION_RUN_TABLE,
]);

const MIGRATION_PLUGIN_TABLE_NAMES = [
  MIGRATION_STATE_TABLE,
  MIGRATION_RUN_TABLE,
] as const;

export function migrationPlugin(): OrmSchemaPlugin {
  return {
    key: 'migration',
    tableNames: MIGRATION_PLUGIN_TABLE_NAMES,
    inject: injectMigrationStorageTables,
  };
}

export function injectMigrationStorageTables<
  TSchema extends Record<string, unknown>,
>(schema: TSchema): TSchema & typeof migrationStorageTables {
  const merged = {
    ...schema,
  } as TSchema & typeof migrationStorageTables;

  for (const [tableName, tableDef] of Object.entries(migrationStorageTables)) {
    if (
      tableName in schema &&
      (schema as Record<string, unknown>)[tableName] !== tableDef
    ) {
      throw new Error(
        `defineSchema cannot inject internal table '${tableName}' because the name is already in use.`
      );
    }
    (merged as Record<string, unknown>)[tableName] = tableDef;
  }

  return merged;
}
