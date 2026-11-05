import type {
  DefineSchemaOptions,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import { defineSchema as defineConvexSchema } from 'convex/server';
import { aggregateExtension } from './aggregate-index/schema';
import type {
  AnySchemaExtension,
  SchemaExtension,
  SchemaExtensionTriggersInput,
} from './extensions';

export type { SchemaExtension } from './extensions';
export { defineSchemaExtension } from './extensions';

import { migrationExtension } from './migrations/schema';
import type {
  AnyRelationsBuilderConfig,
  ExtractTablesFromSchema,
  RelationsBuilder,
  RelationsBuilderConfigValue,
  RelationsConfigWithSchema,
  TablesRelationalConfig,
} from './relations';
import { defineRelations } from './relations';
import type { OrmRuntimeDefaults } from './symbols';
import {
  OrmSchemaDefinition,
  OrmSchemaExtensionRelations,
  OrmSchemaExtensions,
  OrmSchemaExtensionTables,
  OrmSchemaExtensionTriggers,
  OrmSchemaOptions,
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

type ExtensionList = readonly AnySchemaExtension[];

type ExtensionTables<TExtension extends AnySchemaExtension> =
  TExtension extends SchemaExtension<infer TTables extends object, any, any>
    ? TTables
    : {};

type ExtensionRelationsConfig<TExtension extends AnySchemaExtension> =
  TExtension extends SchemaExtension<
    any,
    infer TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
    any
  >
    ? TRelationsConfig extends AnyRelationsBuilderConfig
      ? TRelationsConfig
      : {}
    : {};

type ResolvedSchemaExtensions<TExtensions extends ExtensionList> = readonly [
  ...typeof BUILTIN_SCHEMA_EXTENSIONS,
  ...TExtensions,
];

type InjectedSchemaFromExtensions<TExtensions extends ExtensionList> = Simplify<
  UnionToIntersection<ExtensionTables<TExtensions[number]>>
>;

type SchemaWithExtensions<
  TSchema extends object,
  TExtensions extends ExtensionList,
> = Simplify<
  TSchema & InjectedSchemaFromExtensions<ResolvedSchemaExtensions<TExtensions>>
>;

type RelationsConfigFromExtensions<TExtensions extends ExtensionList> =
  Simplify<
    UnionToIntersection<
      ExtensionRelationsConfig<ResolvedSchemaExtensions<TExtensions>[number]>
    >
  >;

type ResolvedRelationsConfig<
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> = Simplify<
  RelationsConfigFromExtensions<TExtensions> &
    (TRelationsConfig extends AnyRelationsBuilderConfig ? TRelationsConfig : {})
>;

type SafeRelationsConfig<
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> =
  ResolvedRelationsConfig<
    TExtensions,
    TRelationsConfig
  > extends AnyRelationsBuilderConfig
    ? ResolvedRelationsConfig<TExtensions, TRelationsConfig>
    : AnyRelationsBuilderConfig;

type SchemaRelationsFactory<
  TSchema extends object,
  TRelationsConfig extends AnyRelationsBuilderConfig,
> = (
  helpers: RelationsBuilder<ExtractTablesFromSchema<TSchema>>
) => TRelationsConfig;

type AnySchemaRelationsFactory = (
  helpers: RelationsBuilder<any>
) => AnyRelationsBuilderConfig;

type SchemaRelations<
  TSchema extends object,
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> = RelationsConfigWithSchema<
  SafeRelationsConfig<TExtensions, TRelationsConfig>,
  ExtractTablesFromSchema<TSchema>
>;

type SchemaRelationsAuthoringConfig<TSchema extends object> = {
  [TTableName in keyof ExtractTablesFromSchema<TSchema>]?: RelationsBuilderConfigValue;
};

type SchemaOptions<StrictTableNameTypes extends boolean> =
  DefineSchemaOptions<StrictTableNameTypes> & {
    strict?: boolean;
    defaults?: OrmRuntimeDefaults;
  };

type SchemaResult<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean,
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> = SchemaDefinition<
  SchemaWithExtensions<TSchema, TExtensions>,
  StrictTableNameTypes
> & {
  [OrmSchemaRelations]?: SchemaRelations<
    SchemaWithExtensions<TSchema, TExtensions>,
    TExtensions,
    TRelationsConfig
  >;
  [OrmSchemaTriggers]?: OrmTriggers<
    SchemaRelations<
      SchemaWithExtensions<TSchema, TExtensions>,
      TExtensions,
      TRelationsConfig
    >
  >;
};

type SchemaChain<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean,
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
  TCanExtend extends boolean,
  TCanRelations extends boolean,
  TCanTriggers extends boolean,
> = SchemaResult<TSchema, StrictTableNameTypes, TExtensions, TRelationsConfig> &
  (TCanExtend extends true
    ? {
        extend: <const TNewExtensions extends ExtensionList>(
          ...extensions: TNewExtensions
        ) => SchemaChain<
          TSchema,
          StrictTableNameTypes,
          readonly [...TExtensions, ...TNewExtensions],
          TRelationsConfig,
          true,
          true,
          true
        >;
      }
    : {}) &
  (TCanRelations extends true
    ? {
        relations: <
          const TNextRelationsConfig extends SchemaRelationsAuthoringConfig<
            SchemaWithExtensions<TSchema, TExtensions>
          >,
        >(
          relations: SchemaRelationsFactory<
            SchemaWithExtensions<TSchema, TExtensions>,
            TNextRelationsConfig
          >
        ) => SchemaChain<
          TSchema,
          StrictTableNameTypes,
          TExtensions,
          TNextRelationsConfig,
          false,
          false,
          true
        >;
      }
    : {}) &
  (TCanTriggers extends true
    ? {
        triggers: (
          triggers: OrmTriggers<
            SchemaRelations<
              SchemaWithExtensions<TSchema, TExtensions>,
              TExtensions,
              TRelationsConfig
            >
          >
        ) => SchemaChain<
          TSchema,
          StrictTableNameTypes,
          TExtensions,
          TRelationsConfig,
          false,
          false,
          false
        >;
      }
    : {});

type SchemaState<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean,
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> = {
  schema: TSchema;
  options: SchemaOptions<StrictTableNameTypes> | undefined;
  extensions: TExtensions;
  relations: AnySchemaRelationsFactory | undefined;
  triggers:
    | OrmTriggers<
        SchemaRelations<
          SchemaWithExtensions<TSchema, TExtensions>,
          TExtensions,
          TRelationsConfig
        >
      >
    | undefined;
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
const BUILTIN_SCHEMA_EXTENSIONS = [
  aggregateExtension(),
  migrationExtension(),
] as const;

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

function resolveSchemaExtensions<TExtensions extends ExtensionList>(
  extensions: TExtensions | undefined
): ResolvedSchemaExtensions<TExtensions> {
  const resolved = [
    ...BUILTIN_SCHEMA_EXTENSIONS,
    ...(extensions ?? []),
  ] as unknown as ResolvedSchemaExtensions<TExtensions>;
  const seen = new Set<string>();

  for (const extension of resolved) {
    if (seen.has(extension.key)) {
      throw new Error(
        `defineSchema received duplicate extension '${extension.key}'. Remove duplicate extension registrations.`
      );
    }
    seen.add(extension.key);
  }

  return resolved;
}

function applySchemaExtensions<
  TSchema extends object,
  TExtensions extends ExtensionList,
>(
  schema: TSchema,
  extensions: TExtensions
): {
  schema: TSchema & InjectedSchemaFromExtensions<TExtensions>;
  extensionTableNames: readonly string[];
  resolvedExtensions: TExtensions;
} {
  const current = {
    ...schema,
  } as unknown as Record<string, unknown>;
  const extensionTableNames: string[] = [];

  for (const extension of extensions) {
    for (const [tableName, tableDef] of Object.entries(extension.tables)) {
      if (tableName in current && current[tableName] !== tableDef) {
        throw new Error(
          `defineSchema cannot inject internal table '${tableName}' because the name is already in use.`
        );
      }
      current[tableName] = tableDef;
      if (!extensionTableNames.includes(tableName)) {
        extensionTableNames.push(tableName);
      }
    }
  }

  return {
    schema: current as TSchema & InjectedSchemaFromExtensions<TExtensions>,
    extensionTableNames,
    resolvedExtensions: extensions,
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

type TriggerConfigSource = {
  source: string;
  config: Record<string, unknown>;
};

function mergeTriggerConfigs(
  sources: readonly TriggerConfigSource[]
): Record<string, unknown> {
  const merged: Record<string, Record<string, unknown>> = {};
  const triggerOrigins = new Map<string, string>();

  for (const { source, config } of sources) {
    for (const [tableName, tableConfig] of Object.entries(config)) {
      if (
        !tableConfig ||
        typeof tableConfig !== 'object' ||
        Array.isArray(tableConfig)
      ) {
        const triggerKey = `${tableName}`;
        const existingSource = triggerOrigins.get(triggerKey);
        if (existingSource) {
          throw new Error(
            `defineSchema trigger '${triggerKey}' is defined more than once (${existingSource} and ${source}).`
          );
        }
        merged[tableName] = tableConfig as never;
        triggerOrigins.set(triggerKey, source);
        continue;
      }

      let mergedTable = merged[tableName];
      if (!mergedTable) {
        mergedTable = Object.create(null) as Record<string, unknown>;
        merged[tableName] = mergedTable;
      }

      for (const [hookKey, hookValue] of Object.entries(tableConfig)) {
        if (
          (hookKey === 'create' ||
            hookKey === 'update' ||
            hookKey === 'delete') &&
          hookValue &&
          typeof hookValue === 'object' &&
          !Array.isArray(hookValue)
        ) {
          let mergedOperation = mergedTable[hookKey] as
            | Record<string, unknown>
            | undefined;
          if (!mergedOperation || typeof mergedOperation !== 'object') {
            mergedOperation = Object.create(null) as Record<string, unknown>;
            mergedTable[hookKey] = mergedOperation;
          }

          for (const [operationHookKey, operationHookValue] of Object.entries(
            hookValue
          )) {
            const triggerKey = `${tableName}.${hookKey}.${operationHookKey}`;
            const existingSource = triggerOrigins.get(triggerKey);
            if (existingSource) {
              throw new Error(
                `defineSchema trigger '${triggerKey}' is defined more than once (${existingSource} and ${source}).`
              );
            }
            mergedOperation[operationHookKey] = operationHookValue;
            triggerOrigins.set(triggerKey, source);
          }
          continue;
        }

        const triggerKey = `${tableName}.${hookKey}`;
        const existingSource = triggerOrigins.get(triggerKey);
        if (existingSource) {
          throw new Error(
            `defineSchema trigger '${triggerKey}' is defined more than once (${existingSource} and ${source}).`
          );
        }
        mergedTable[hookKey] = hookValue;
        triggerOrigins.set(triggerKey, source);
      }
    }
  }

  return merged;
}

function defineMetadata(target: object, key: symbol, value: unknown): void {
  const existing = Object.getOwnPropertyDescriptor(target, key);
  if (existing && !existing.configurable) {
    return;
  }
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
  });
}

const OrmSchemaComposerState = Symbol('kitcn:OrmSchemaComposerState');

type AnySchemaState = SchemaState<
  GenericSchema,
  boolean,
  ExtensionList,
  AnyRelationsBuilderConfig | undefined
>;

/**
 * kitcn schema definition
 *
 * Wraps Convex's defineSchema to keep schema authoring inside kitcn.
 * Mirrors drizzle's schema-first approach while returning a Convex-compatible
 * SchemaDefinition for codegen and convex-test.
 */
function materializeBaseSchema<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean,
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
>(
  state: SchemaState<
    TSchema,
    StrictTableNameTypes,
    TExtensions,
    TRelationsConfig
  >
): SchemaResult<TSchema, StrictTableNameTypes, TExtensions, TRelationsConfig> {
  const strict = state.options?.strict ?? true;
  const defaults = normalizeDefaults(state.options?.defaults);
  const extensions = resolveSchemaExtensions(state.extensions);
  const {
    schema: schemaWithExtensions,
    extensionTableNames,
    resolvedExtensions,
  } = applySchemaExtensions(
    state.schema as unknown as Record<string, unknown>,
    extensions
  );
  const frozenExtensionTableNames = Object.freeze([...extensionTableNames]);
  const frozenExtensions = Object.freeze([...resolvedExtensions]);

  const {
    strict: _strict,
    defaults: _defaults,
    ...convexOptions
  } = state.options ?? {};
  const convexSchema = defineConvexSchema(
    schemaWithExtensions as any,
    convexOptions as DefineSchemaOptions<StrictTableNameTypes>
  );
  defineMetadata(convexSchema as object, OrmSchemaOptions, {
    strict,
    defaults,
  });
  defineMetadata(
    convexSchema as object,
    OrmSchemaExtensionTables,
    frozenExtensionTableNames
  );
  defineMetadata(convexSchema as object, OrmSchemaExtensions, frozenExtensions);
  defineMetadata(convexSchema as object, OrmSchemaDefinition, convexSchema);
  defineMetadata(convexSchema as object, OrmSchemaComposerState, state);
  defineMetadata(state.schema as object, OrmSchemaOptions, {
    strict,
    defaults,
  });
  defineMetadata(
    state.schema as object,
    OrmSchemaExtensionTables,
    frozenExtensionTableNames
  );
  defineMetadata(state.schema as object, OrmSchemaExtensions, frozenExtensions);
  defineMetadata(state.schema as object, OrmSchemaDefinition, convexSchema);

  return convexSchema as SchemaResult<
    TSchema,
    StrictTableNameTypes,
    TExtensions,
    TRelationsConfig
  >;
}

function getSchemaComposerState(schema: unknown): AnySchemaState | undefined {
  if (!schema || typeof schema !== 'object') {
    return;
  }
  return (schema as { [OrmSchemaComposerState]?: AnySchemaState })[
    OrmSchemaComposerState
  ];
}

function finalizeSchemaMetadata(schema: unknown): void {
  if (!schema || typeof schema !== 'object') {
    return;
  }

  const composerState = getSchemaComposerState(schema);
  if (!composerState) {
    return;
  }

  const schemaObject = schema as Record<string | symbol, unknown>;
  const resolvedExtensions =
    (schemaObject[OrmSchemaExtensions] as ExtensionList | undefined) ??
    resolveSchemaExtensions(composerState.extensions);
  const extensionTableNames =
    (schemaObject[OrmSchemaExtensionTables] as readonly string[] | undefined) ??
    Object.freeze([] as string[]);
  const options = schemaObject[OrmSchemaOptions] as
    | { strict: boolean; defaults?: OrmRuntimeDefaults }
    | undefined;

  const extensionRelationFactories = resolvedExtensions
    .map((extension) => ({
      key: extension.key,
      relations: extension[OrmSchemaExtensionRelations],
    }))
    .filter(
      (
        entry
      ): entry is {
        key: string;
        relations: (
          helpers: RelationsBuilder<any>
        ) => AnyRelationsBuilderConfig;
      } => entry.relations !== undefined
    );
  const extensionTriggerFactories = resolvedExtensions
    .map((extension) => ({
      key: extension.key,
      triggers: extension[OrmSchemaExtensionTriggers],
    }))
    .filter(
      (
        entry
      ): entry is {
        key: string;
        triggers: SchemaExtensionTriggersInput;
      } => entry.triggers !== undefined
    );
  const hasExtensionRelations = extensionRelationFactories.length > 0;
  const hasExtensionTriggers = extensionTriggerFactories.length > 0;
  const shouldBuildRelations =
    hasExtensionRelations ||
    hasExtensionTriggers ||
    Boolean(composerState.relations) ||
    Boolean(composerState.triggers);

  let relations = schemaObject[OrmSchemaRelations] as
    | TablesRelationalConfig
    | undefined;
  if (!relations && shouldBuildRelations) {
    relations = (
      hasExtensionRelations || composerState.relations
        ? defineRelations(schema as Record<string, unknown>, (helpers) =>
            mergeRelationConfigs([
              ...extensionRelationFactories.map((extension) => ({
                source: `extension '${extension.key}'`,
                config: extension.relations(helpers),
              })),
              ...(composerState.relations
                ? [
                    {
                      source: 'schema.relations()',
                      config: composerState.relations(helpers),
                    },
                  ]
                : []),
            ])
          )
        : defineRelations(schema as Record<string, unknown>)
    ) as TablesRelationalConfig;

    defineMetadata(relations as object, OrmSchemaDefinition, schema);
    if (options) {
      defineMetadata(relations as object, OrmSchemaOptions, options);
    }
    defineMetadata(
      relations as object,
      OrmSchemaExtensionTables,
      extensionTableNames
    );
    defineMetadata(
      relations as object,
      OrmSchemaExtensions,
      resolvedExtensions
    );
    defineMetadata(schema as object, OrmSchemaRelations, relations);
  }

  if (!relations || schemaObject[OrmSchemaTriggers]) {
    return;
  }

  const triggerSources =
    hasExtensionTriggers || composerState.triggers
      ? [
          ...extensionTriggerFactories.map((extension) => ({
            source: `extension '${extension.key}'`,
            config: (typeof extension.triggers === 'function'
              ? extension.triggers(relations)
              : extension.triggers) as Record<string, unknown>,
          })),
          ...(composerState.triggers
            ? [
                {
                  source: 'schema.triggers()',
                  config: composerState.triggers as Record<string, unknown>,
                },
              ]
            : []),
        ]
      : [];

  if (triggerSources.length === 0) {
    return;
  }

  const triggers = defineTriggers(
    relations,
    mergeTriggerConfigs(triggerSources) as OrmTriggers<TablesRelationalConfig>
  );
  defineMetadata(schema as object, OrmSchemaTriggers, triggers);
}

function defineChainMethod(
  target: object,
  key: 'extend' | 'relations' | 'triggers',
  value: (...args: any[]) => unknown
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
  });
}

function createSchemaChain<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean,
  TExtensions extends ExtensionList,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
  TCanExtend extends boolean,
  TCanRelations extends boolean,
  TCanTriggers extends boolean,
>(
  state: SchemaState<
    TSchema,
    StrictTableNameTypes,
    TExtensions,
    TRelationsConfig
  >,
  capabilities: {
    canExtend: TCanExtend;
    canRelations: TCanRelations;
    canTriggers: TCanTriggers;
  }
): SchemaChain<
  TSchema,
  StrictTableNameTypes,
  TExtensions,
  TRelationsConfig,
  TCanExtend,
  TCanRelations,
  TCanTriggers
> {
  const schema = materializeBaseSchema(state);

  if (!capabilities.canRelations || !capabilities.canTriggers) {
    finalizeSchemaMetadata(schema);
  }

  if (capabilities.canExtend) {
    defineChainMethod(schema as object, 'extend', (...extensions) => {
      return createSchemaChain(
        {
          ...state,
          extensions: [...state.extensions, ...extensions] as any,
        } as any,
        {
          canExtend: true,
          canRelations: true,
          canTriggers: true,
        }
      );
    });
  }

  if (capabilities.canRelations) {
    defineChainMethod(schema as object, 'relations', (relations) => {
      return createSchemaChain(
        {
          ...state,
          relations,
        } as SchemaState<
          TSchema,
          StrictTableNameTypes,
          TExtensions,
          AnyRelationsBuilderConfig
        >,
        {
          canExtend: false,
          canRelations: false,
          canTriggers: true,
        }
      );
    });
  }

  if (capabilities.canTriggers) {
    defineChainMethod(schema as object, 'triggers', (triggers) =>
      createSchemaChain(
        {
          ...state,
          triggers,
        } as SchemaState<
          TSchema,
          StrictTableNameTypes,
          TExtensions,
          TRelationsConfig
        >,
        {
          canExtend: false,
          canRelations: false,
          canTriggers: false,
        }
      )
    );
  }

  return schema as SchemaChain<
    TSchema,
    StrictTableNameTypes,
    TExtensions,
    TRelationsConfig,
    TCanExtend,
    TCanRelations,
    TCanTriggers
  >;
}

export function defineSchema<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean = true,
>(
  schema: TSchema,
  options?: SchemaOptions<StrictTableNameTypes>
): SchemaChain<
  TSchema,
  StrictTableNameTypes,
  readonly [],
  undefined,
  true,
  true,
  true
> {
  return createSchemaChain(
    {
      schema,
      options,
      extensions: [] as const,
      relations: undefined,
      triggers: undefined,
    },
    {
      canExtend: true,
      canRelations: true,
      canTriggers: true,
    }
  );
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
  finalizeSchemaMetadata(schema);
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
      'Schema is missing ORM relations metadata. Use defineSchema(...).relations(...) or extension relations before accessing ORM runtime helpers.'
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
  finalizeSchemaMetadata(schema);
  return (
    schema as {
      [OrmSchemaTriggers]?: OrmTriggers<TablesRelationalConfig>;
    }
  )[OrmSchemaTriggers];
}
