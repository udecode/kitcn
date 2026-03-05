import type {
  DefineSchemaOptions,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import { defineSchema as defineConvexSchema } from 'convex/server';
import { aggregatePlugin } from './aggregate-index/schema';
import { migrationPlugin } from './migrations/schema';
import type {
  AnyRelationsBuilderConfig,
  ExtractTablesFromSchema,
  RelationsBuilder,
  RelationsConfigWithSchema,
  TablesRelationalConfig,
} from './relations';
import { defineRelations } from './relations';
import type { OrmRuntimeDefaults, OrmSchemaPlugin } from './symbols';
import {
  OrmSchemaDefinition,
  OrmSchemaOptions,
  OrmSchemaPlugins,
  OrmSchemaPluginTables,
  OrmSchemaRelations,
  OrmSchemaTriggers,
} from './symbols';
import type { OrmTriggers } from './triggers';
import { defineTriggers } from './triggers';

type UnionToIntersection<T> = (
  T extends unknown
    ? (value: T) => void
    : never
) extends (value: infer I) => void
  ? I
  : never;

type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

type PluginList = readonly OrmSchemaPlugin[];

type PluginInjectedSchema<TPlugin extends OrmSchemaPlugin> =
  TPlugin extends OrmSchemaPlugin<infer TInjected> ? TInjected : {};

type ResolvedSchemaPlugins<TPlugins extends PluginList> = readonly [
  ...typeof BUILTIN_SCHEMA_PLUGINS,
  ...TPlugins,
];

type InjectedSchemaFromPlugins<TPlugins extends PluginList> = Simplify<
  UnionToIntersection<PluginInjectedSchema<TPlugins[number]>>
>;

type SchemaWithPlugins<
  TSchema extends Record<string, unknown>,
  TPlugins extends PluginList,
> = TSchema & InjectedSchemaFromPlugins<ResolvedSchemaPlugins<TPlugins>>;

type SchemaRelationsFactory<
  TSchema extends Record<string, unknown>,
  TRelationsConfig extends
    AnyRelationsBuilderConfig = AnyRelationsBuilderConfig,
> = (
  helpers: RelationsBuilder<ExtractTablesFromSchema<TSchema>>
) => TRelationsConfig;

type SchemaRelations<
  TSchema extends Record<string, unknown>,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> = RelationsConfigWithSchema<
  TRelationsConfig extends AnyRelationsBuilderConfig ? TRelationsConfig : {},
  ExtractTablesFromSchema<TSchema>
>;

type SchemaTriggersFactory<TRelations extends TablesRelationalConfig> =
  | OrmTriggers<TRelations>
  | ((relations: TRelations) => OrmTriggers<TRelations>);

type BetterConvexSchemaOptions<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
  TPlugins extends PluginList,
> = DefineSchemaOptions<StrictTableNameTypes> & {
  strict?: boolean;
  defaults?: OrmRuntimeDefaults;
  plugins?: TPlugins;
  relations?: SchemaRelationsFactory<
    SchemaWithPlugins<TSchema, TPlugins>,
    TRelationsConfig extends AnyRelationsBuilderConfig
      ? TRelationsConfig
      : AnyRelationsBuilderConfig
  >;
  triggers?: SchemaTriggersFactory<
    SchemaRelations<SchemaWithPlugins<TSchema, TPlugins>, TRelationsConfig>
  >;
};

const DEFAULTS_NUMERIC_FIELDS = [
  'defaultLimit',
  'countBackfillBatchSize',
  'relationFanOutMaxKeys',
  'aggregateCartesianMaxKeys',
  'aggregateWorkBudget',
  'mutationBatchSize',
  'mutationLeafBatchSize',
  'mutationMaxRows',
  'mutationMaxBytesPerBatch',
  'mutationScheduleCallCap',
] as const;

const MUTATION_EXECUTION_MODES = ['sync', 'async'] as const;
const BUILTIN_SCHEMA_PLUGINS = [aggregatePlugin(), migrationPlugin()] as const;

const normalizeDefaults = (
  defaults: OrmRuntimeDefaults | undefined
): OrmRuntimeDefaults | undefined => {
  if (!defaults) return;
  const normalized: OrmRuntimeDefaults = {};

  for (const key of DEFAULTS_NUMERIC_FIELDS) {
    const value = defaults[key];
    if (value === undefined) {
      continue;
    }
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `defineSchema defaults.${key} must be a positive integer.`
      );
    }
    normalized[key] = value;
  }

  if (defaults.mutationAsyncDelayMs !== undefined) {
    const delay = defaults.mutationAsyncDelayMs;
    if (!Number.isInteger(delay) || delay < 0) {
      throw new Error(
        'defineSchema defaults.mutationAsyncDelayMs must be a non-negative integer.'
      );
    }
    normalized.mutationAsyncDelayMs = delay;
  }

  if (defaults.mutationExecutionMode !== undefined) {
    if (!MUTATION_EXECUTION_MODES.includes(defaults.mutationExecutionMode)) {
      throw new Error(
        "defineSchema defaults.mutationExecutionMode must be either 'sync' or 'async'."
      );
    }
    normalized.mutationExecutionMode = defaults.mutationExecutionMode;
  }

  return normalized;
};

function resolveSchemaPlugins<TPlugins extends PluginList>(
  plugins: TPlugins | undefined
): ResolvedSchemaPlugins<TPlugins> {
  const resolved = [
    ...BUILTIN_SCHEMA_PLUGINS,
    ...(plugins ?? []),
  ] as unknown as ResolvedSchemaPlugins<TPlugins>;
  const seen = new Set<string>();

  for (const plugin of resolved) {
    if (seen.has(plugin.key)) {
      throw new Error(
        `defineSchema received duplicate plugin '${plugin.key}'. Remove duplicate plugin registrations.`
      );
    }
    seen.add(plugin.key);
  }

  return resolved;
}

function applySchemaPlugins<
  TSchema extends Record<string, unknown>,
  TPlugins extends PluginList,
>(
  schema: TSchema,
  plugins: TPlugins
): {
  schema: TSchema & InjectedSchemaFromPlugins<TPlugins>;
  pluginTableNames: readonly string[];
  resolvedPlugins: TPlugins;
} {
  let current = schema as unknown as Record<string, unknown>;
  const pluginTableNames: string[] = [];

  for (const plugin of plugins) {
    current = plugin.schema.inject(current);
    for (const tableName of plugin.schema.tableNames) {
      if (!pluginTableNames.includes(tableName)) {
        pluginTableNames.push(tableName);
      }
    }
  }

  return {
    schema: current as TSchema & InjectedSchemaFromPlugins<TPlugins>,
    pluginTableNames,
    resolvedPlugins: plugins,
  };
}

type RelationConfigSource = {
  source: string;
  config: AnyRelationsBuilderConfig;
};

function mergeRelationConfigs(
  sources: readonly RelationConfigSource[]
): AnyRelationsBuilderConfig {
  const merged: Record<string, Record<string, unknown>> = {};
  const relationOrigins = new Map<string, string>();

  for (const { source, config } of sources) {
    for (const [tableName, relationConfig] of Object.entries(config)) {
      if (!relationConfig) {
        continue;
      }

      let tableRelations = merged[tableName];
      if (!tableRelations) {
        tableRelations = Object.create(null) as Record<string, unknown>;
        merged[tableName] = tableRelations;
      }

      for (const [fieldName, relation] of Object.entries(relationConfig)) {
        const relationKey = `${tableName}.${fieldName}`;
        const existingSource = relationOrigins.get(relationKey);
        if (existingSource) {
          throw new Error(
            `defineSchema relation field '${relationKey}' is defined more than once (${existingSource} and ${source}).`
          );
        }
        tableRelations[fieldName] = relation;
        relationOrigins.set(relationKey, source);
      }
    }
  }

  return merged as AnyRelationsBuilderConfig;
}

/**
 * Better Convex schema definition
 *
 * Wraps Convex's defineSchema to keep schema authoring inside better-convex.
 * Mirrors drizzle's schema-first approach while returning a Convex-compatible
 * SchemaDefinition for codegen and convex-test.
 */
export function defineSchema<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean = true,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined = undefined,
  const TPlugins extends PluginList = readonly [],
>(
  schema: TSchema,
  options?: BetterConvexSchemaOptions<
    TSchema,
    StrictTableNameTypes,
    TRelationsConfig,
    TPlugins
  >
): SchemaDefinition<TSchema, StrictTableNameTypes> & {
  [OrmSchemaRelations]?: SchemaRelations<
    SchemaWithPlugins<TSchema, TPlugins>,
    TRelationsConfig
  >;
  [OrmSchemaTriggers]?: OrmTriggers<
    SchemaRelations<SchemaWithPlugins<TSchema, TPlugins>, TRelationsConfig>
  >;
} {
  const strict = options?.strict ?? true;
  const defaults = normalizeDefaults(options?.defaults);
  const plugins = resolveSchemaPlugins(options?.plugins);
  const {
    schema: schemaWithPlugins,
    pluginTableNames,
    resolvedPlugins,
  } = applySchemaPlugins(schema as unknown as Record<string, unknown>, plugins);
  const frozenPluginTableNames = Object.freeze([...pluginTableNames]);
  const frozenPlugins = Object.freeze([...resolvedPlugins]);
  const relationsFactory = options?.relations as
    | SchemaRelationsFactory<
        SchemaWithPlugins<TSchema, TPlugins>,
        TRelationsConfig extends AnyRelationsBuilderConfig
          ? TRelationsConfig
          : AnyRelationsBuilderConfig
      >
    | undefined;
  const pluginRelationFactories = resolvedPlugins
    .map((plugin) => ({
      key: plugin.key,
      relations: plugin.schema.relations,
    }))
    .filter(
      (
        entry
      ): entry is {
        key: string;
        relations: (helpers: unknown) => Record<string, unknown>;
      } => typeof entry.relations === 'function'
    );
  const hasPluginRelations = pluginRelationFactories.length > 0;
  const shouldBuildRelations =
    hasPluginRelations ||
    Boolean(relationsFactory) ||
    Boolean(options?.triggers);
  const relations = shouldBuildRelations
    ? hasPluginRelations || relationsFactory
      ? (defineRelations(
          schemaWithPlugins as SchemaWithPlugins<TSchema, TPlugins>,
          (helpers) =>
            mergeRelationConfigs([
              ...pluginRelationFactories.map((plugin) => ({
                source: `plugin '${plugin.key}'`,
                config: plugin.relations(helpers) as AnyRelationsBuilderConfig,
              })),
              ...(relationsFactory
                ? [
                    {
                      source: 'schema options',
                      config: relationsFactory(
                        helpers
                      ) as AnyRelationsBuilderConfig,
                    },
                  ]
                : []),
            ])
        ) as SchemaRelations<
          SchemaWithPlugins<TSchema, TPlugins>,
          TRelationsConfig
        >)
      : (defineRelations(
          schemaWithPlugins as SchemaWithPlugins<TSchema, TPlugins>
        ) as SchemaRelations<
          SchemaWithPlugins<TSchema, TPlugins>,
          TRelationsConfig
        >)
    : undefined;
  const triggersInput = options?.triggers;
  const triggers =
    triggersInput && relations
      ? defineTriggers(
          relations,
          (typeof triggersInput === 'function'
            ? triggersInput(relations)
            : triggersInput) as OrmTriggers<
            SchemaRelations<
              SchemaWithPlugins<TSchema, TPlugins>,
              TRelationsConfig
            >
          >
        )
      : undefined;

  Object.defineProperty(schema, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(schemaWithPlugins, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(schema, OrmSchemaPluginTables, {
    value: frozenPluginTableNames,
    enumerable: false,
  });
  Object.defineProperty(schemaWithPlugins, OrmSchemaPluginTables, {
    value: frozenPluginTableNames,
    enumerable: false,
  });
  Object.defineProperty(schema, OrmSchemaPlugins, {
    value: frozenPlugins,
    enumerable: false,
  });
  Object.defineProperty(schemaWithPlugins, OrmSchemaPlugins, {
    value: frozenPlugins,
    enumerable: false,
  });
  if (relations) {
    Object.defineProperty(schema, OrmSchemaRelations, {
      value: relations,
      enumerable: false,
    });
    Object.defineProperty(schemaWithPlugins, OrmSchemaRelations, {
      value: relations,
      enumerable: false,
    });
  }
  if (triggers) {
    Object.defineProperty(schema, OrmSchemaTriggers, {
      value: triggers,
      enumerable: false,
    });
    Object.defineProperty(schemaWithPlugins, OrmSchemaTriggers, {
      value: triggers,
      enumerable: false,
    });
  }

  const {
    strict: _strict,
    defaults: _defaults,
    plugins: _plugins,
    relations: _relations,
    triggers: _triggers,
    ...convexOptions
  } = options ?? {};
  const convexSchema = defineConvexSchema(
    schemaWithPlugins as any,
    convexOptions as DefineSchemaOptions<StrictTableNameTypes>
  );
  Object.defineProperty(convexSchema as object, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(convexSchema as object, OrmSchemaPluginTables, {
    value: frozenPluginTableNames,
    enumerable: false,
  });
  Object.defineProperty(convexSchema as object, OrmSchemaPlugins, {
    value: frozenPlugins,
    enumerable: false,
  });
  if (relations) {
    Object.defineProperty(convexSchema as object, OrmSchemaRelations, {
      value: relations,
      enumerable: false,
    });
  }
  if (triggers) {
    Object.defineProperty(convexSchema as object, OrmSchemaTriggers, {
      value: triggers,
      enumerable: false,
    });
  }
  Object.defineProperty(schema, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  Object.defineProperty(schemaWithPlugins, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  Object.defineProperty(convexSchema as object, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  return convexSchema as SchemaDefinition<TSchema, StrictTableNameTypes> & {
    [OrmSchemaRelations]?: SchemaRelations<
      SchemaWithPlugins<TSchema, TPlugins>,
      TRelationsConfig
    >;
    [OrmSchemaTriggers]?: OrmTriggers<
      SchemaRelations<SchemaWithPlugins<TSchema, TPlugins>, TRelationsConfig>
    >;
  };
}

export function getSchemaRelations<TSchema extends object>(
  schema: TSchema
): TSchema extends { [OrmSchemaRelations]?: infer TRelations }
  ? TRelations
  : undefined;
export function getSchemaRelations(
  schema: unknown
): TablesRelationalConfig | undefined;
export function getSchemaRelations(
  schema: unknown
): TablesRelationalConfig | undefined {
  if (!schema || typeof schema !== 'object') {
    return;
  }
  return (schema as { [OrmSchemaRelations]?: TablesRelationalConfig })[
    OrmSchemaRelations
  ];
}

export function requireSchemaRelations<TSchema extends object>(
  schema: TSchema
): Exclude<
  TSchema extends { [OrmSchemaRelations]?: infer TRelations }
    ? TRelations
    : never,
  undefined
>;
export function requireSchemaRelations(schema: unknown): TablesRelationalConfig;
export function requireSchemaRelations(
  schema: unknown
): TablesRelationalConfig {
  const relations = getSchemaRelations(schema);
  if (!relations) {
    throw new Error(
      'Schema is missing ORM relations metadata. Use defineSchema(..., { relations }) before accessing ORM runtime helpers.'
    );
  }
  return relations;
}

export function getSchemaTriggers<TSchema extends object>(
  schema: TSchema
): TSchema extends { [OrmSchemaTriggers]?: infer TTriggers }
  ? TTriggers
  : undefined;
export function getSchemaTriggers(
  schema: unknown
): OrmTriggers<TablesRelationalConfig> | undefined;
export function getSchemaTriggers(
  schema: unknown
): OrmTriggers<TablesRelationalConfig> | undefined {
  if (!schema || typeof schema !== 'object') {
    return;
  }
  return (
    schema as {
      [OrmSchemaTriggers]?: OrmTriggers<TablesRelationalConfig>;
    }
  )[OrmSchemaTriggers];
}
