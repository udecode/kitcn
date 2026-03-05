import {
  type ConvexTable,
  convexTable,
  index,
  integer,
  type OrmSchemaPlugin,
  text,
  textEnum,
} from 'better-convex/orm';

export const RATELIMIT_STATE_TABLE = 'ratelimit_state';
export const RATELIMIT_DYNAMIC_TABLE = 'ratelimit_dynamic_limit';
export const RATELIMIT_PROTECTION_TABLE = 'ratelimit_protection_hit';

const ratelimitStateTable: ReturnType<typeof convexTable> = convexTable(
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

const ratelimitDynamicTable: ReturnType<typeof convexTable> = convexTable(
  RATELIMIT_DYNAMIC_TABLE,
  {
    prefix: text().notNull(),
    limit: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [index('by_prefix').on(t.prefix)]
);

const ratelimitProtectionTable: ReturnType<typeof convexTable> = convexTable(
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

const RATELIMIT_PLUGIN_TABLE_NAMES = [
  RATELIMIT_STATE_TABLE,
  RATELIMIT_DYNAMIC_TABLE,
  RATELIMIT_PROTECTION_TABLE,
] as const;

type RatelimitStorageTables = typeof ratelimitStorageTables;
type RatelimitTableOverrides = Partial<
  Record<keyof RatelimitStorageTables, ConvexTable<any>>
>;
type ResolvedRatelimitStorageTables<
  TOverrides extends RatelimitTableOverrides,
> = Omit<RatelimitStorageTables, keyof TOverrides> & TOverrides;
type RatelimitPluginOptions<TOverrides extends RatelimitTableOverrides> = {
  tables?: TOverrides;
};

function resolveRatelimitStorageTables<
  TOverrides extends RatelimitTableOverrides,
>(
  options: RatelimitPluginOptions<TOverrides> | undefined
): ResolvedRatelimitStorageTables<TOverrides> {
  return {
    ...ratelimitStorageTables,
    ...(options?.tables ?? {}),
  } as ResolvedRatelimitStorageTables<TOverrides>;
}

export function ratelimitPlugin<
  const TOverrides extends RatelimitTableOverrides = {},
>(
  options?: RatelimitPluginOptions<TOverrides>
): OrmSchemaPlugin<ResolvedRatelimitStorageTables<TOverrides>> {
  const storageTables = resolveRatelimitStorageTables(options);
  return {
    key: 'ratelimit',
    schema: {
      tableNames: RATELIMIT_PLUGIN_TABLE_NAMES,
      inject: (schema) => injectRatelimitStorageTables(schema, storageTables),
    },
  };
}

export function injectRatelimitStorageTables<
  TSchema extends Record<string, unknown>,
  TStorageTables extends Record<string, unknown> = RatelimitStorageTables,
>(schema: TSchema, storageTables?: TStorageTables): TSchema & TStorageTables {
  const resolvedStorageTables =
    (storageTables as TStorageTables | undefined) ??
    (ratelimitStorageTables as unknown as TStorageTables);
  const merged = {
    ...schema,
  } as TSchema & TStorageTables;

  for (const [tableName, tableDef] of Object.entries(resolvedStorageTables)) {
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
