import { integer, text, textEnum } from '../../orm/builders';
import { index } from '../../orm/indexes';
import type { OrmSchemaPlugin } from '../../orm/symbols';
import { convexTable } from '../../orm/table';

export const RATELIMIT_STATE_TABLE = 'ratelimit_state';
export const RATELIMIT_DYNAMIC_TABLE = 'ratelimit_dynamic_limit';
export const RATELIMIT_PROTECTION_TABLE = 'ratelimit_protection_hit';

export const ratelimitStateTable = convexTable(
  RATELIMIT_STATE_TABLE,
  {
    name: text().notNull(),
    key: text(),
    shard: integer().notNull(),
    value: integer().notNull(),
    ts: integer().notNull(),
    auxValue: integer(),
    auxTs: integer(),
  },
  (t) => [
    index('by_name_key_shard').on(t.name, t.key, t.shard),
    index('by_name_key').on(t.name, t.key),
  ]
);

export const ratelimitDynamicTable = convexTable(
  RATELIMIT_DYNAMIC_TABLE,
  {
    prefix: text().notNull(),
    limit: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [index('by_prefix').on(t.prefix)]
);

export const ratelimitProtectionTable = convexTable(
  RATELIMIT_PROTECTION_TABLE,
  {
    prefix: text().notNull(),
    value: text().notNull(),
    kind: textEnum(['identifier', 'ip', 'userAgent', 'country']).notNull(),
    hits: integer().notNull(),
    blockedUntil: integer(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('by_prefix_value_kind').on(t.prefix, t.value, t.kind),
    index('by_prefix').on(t.prefix),
  ]
);

export const ratelimitStorageTables = {
  [RATELIMIT_STATE_TABLE]: ratelimitStateTable,
  [RATELIMIT_DYNAMIC_TABLE]: ratelimitDynamicTable,
  [RATELIMIT_PROTECTION_TABLE]: ratelimitProtectionTable,
} as const;

export const RATELIMIT_STORAGE_TABLE_NAMES = new Set([
  RATELIMIT_STATE_TABLE,
  RATELIMIT_DYNAMIC_TABLE,
  RATELIMIT_PROTECTION_TABLE,
]);

const RATELIMIT_PLUGIN_TABLE_NAMES = [
  RATELIMIT_STATE_TABLE,
  RATELIMIT_DYNAMIC_TABLE,
  RATELIMIT_PROTECTION_TABLE,
] as const;

export function ratelimitPlugin(): OrmSchemaPlugin {
  return {
    key: 'ratelimit',
    tableNames: RATELIMIT_PLUGIN_TABLE_NAMES,
    inject: injectRatelimitStorageTables,
  };
}

export function injectRatelimitStorageTables<
  TSchema extends Record<string, unknown>,
>(schema: TSchema): TSchema & typeof ratelimitStorageTables {
  const merged = {
    ...schema,
  } as TSchema & typeof ratelimitStorageTables;

  for (const [tableName, tableDef] of Object.entries(ratelimitStorageTables)) {
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
