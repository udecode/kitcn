/**
 * Drizzle v1-style relations (Relational Queries v2)
 *
 * Mirrors drizzle-orm/src/relations.ts (v1) with Convex adaptations.
 */

import type { SchemaDefinition } from 'convex/server';
import type { Simplify } from '../internal/types';
import type { ColumnBuilder } from './builders/column-builder';
import { entityKind } from './builders/column-builder';
import type {
  SystemFieldAliases,
  SystemFields,
} from './builders/system-fields';
import type { OrmRuntimeDefaults, OrmRuntimeOptions } from './symbols';
import {
  Columns,
  OrmSchemaDefinition,
  OrmSchemaOptions,
  OrmSchemaPluginTables,
} from './symbols';

export { OrmSchemaDefinition } from './symbols';

import type { ConvexTable } from './table';

// ============================================================================
// Schema types
// ============================================================================

export type SchemaEntry = ConvexTable<any>;
export type Schema = Record<string, SchemaEntry>;

export type ExtractTablesFromSchema<TSchema extends Record<string, unknown>> = {
  [K in keyof TSchema as TSchema[K] extends SchemaEntry
    ? K extends string
      ? K
      : never
    : never]: Extract<TSchema[K], SchemaEntry>;
};

export type IncludeEveryTable<TTables extends Schema> = {
  [K in keyof TTables]: {};
};

// ============================================================================
// Relations builder columns
// ============================================================================

export class RelationsBuilderTable<TTableName extends string = string> {
  static readonly [entityKind]: string = 'RelationsBuilderTable';

  protected readonly _: {
    readonly name: TTableName;
    readonly table: SchemaEntry;
  };

  constructor(table: SchemaEntry, name: TTableName) {
    this._ = {
      name,
      table,
    };
  }
}

export interface RelationsBuilderColumnConfig<
  TTableName extends string = string,
> {
  readonly column: ColumnBuilder<any, any, any>;
  readonly key: string;
  readonly tableName: TTableName;
  readonly through?: RelationsBuilderColumnBase;
}

export interface RelationsBuilderColumnBase<
  TTableName extends string = string,
> {
  _: RelationsBuilderColumnConfig<TTableName>;
}

export class RelationsBuilderColumn<TTableName extends string = string>
  implements RelationsBuilderColumnBase<TTableName>
{
  static readonly [entityKind]: string = 'RelationsBuilderColumn';

  readonly _: {
    readonly tableName: TTableName;
    readonly column: ColumnBuilder<any, any, any>;
    readonly key: string;
  };

  constructor(
    column: ColumnBuilder<any, any, any>,
    tableName: TTableName,
    key: string
  ) {
    this._ = {
      tableName,
      column,
      key,
    };
  }

  through(
    column: RelationsBuilderColumn
  ): RelationsBuilderJunctionColumn<TTableName> {
    return new RelationsBuilderJunctionColumn(
      this._.column,
      this._.tableName,
      this._.key,
      column
    );
  }
}

export class RelationsBuilderJunctionColumn<TTableName extends string = string>
  implements RelationsBuilderColumnBase<TTableName>
{
  static readonly [entityKind]: string = 'RelationsBuilderColumn';

  readonly _: {
    readonly tableName: TTableName;
    readonly column: ColumnBuilder<any, any, any>;
    readonly through: RelationsBuilderColumnBase;
    readonly key: string;
  };

  constructor(
    column: ColumnBuilder<any, any, any>,
    tableName: TTableName,
    key: string,
    through: RelationsBuilderColumnBase
  ) {
    this._ = {
      tableName,
      column,
      through,
      key,
    };
  }
}

// ============================================================================
// Relation config + helpers
// ============================================================================

export interface OneConfig<
  TTargetTable extends SchemaEntry,
  TOptional extends boolean,
> {
  alias?: string;
  from?:
    | RelationsBuilderColumnBase
    | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
  optional?: TOptional;
  to?:
    | RelationsBuilderColumnBase
    | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
  where?: TableFilter<TTargetTable>;
}

export type AnyOneConfig = OneConfig<SchemaEntry, boolean>;

export interface ManyConfig<TTargetTable extends SchemaEntry> {
  alias?: string;
  from?:
    | RelationsBuilderColumnBase
    | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
  to?:
    | RelationsBuilderColumnBase
    | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
  where?: TableFilter<TTargetTable>;
}

export type AnyManyConfig = ManyConfig<SchemaEntry>;

export type OneFn<
  TTargetTable extends SchemaEntry,
  TTargetTableName extends string,
> = <TOptional extends boolean = true>(
  config?: OneConfig<TTargetTable, TOptional>
) => One<TTargetTableName, TOptional>;

export type ManyFn<
  TTargetTable extends SchemaEntry,
  TTargetTableName extends string,
> = (config?: ManyConfig<TTargetTable>) => Many<TTargetTableName>;

export class RelationsHelperStatic<TTables extends Schema> {
  static readonly [entityKind]: string = 'RelationsHelperStatic';

  constructor(tables: TTables) {
    const one: Record<string, OneFn<TTables[string], string>> = {};
    const many: Record<string, ManyFn<TTables[string], string>> = {};

    for (const [tableName, table] of Object.entries(tables)) {
      one[tableName] = (config) =>
        new One(tables, table, tableName, config as AnyOneConfig);
      many[tableName] = (config) =>
        new Many(tables, table, tableName, config as AnyManyConfig);
    }

    this.one = one as any as this['one'];
    this.many = many as any as this['many'];
  }

  one: {
    [K in keyof TTables]: OneFn<TTables[K], K & string>;
  };

  many: {
    [K in keyof TTables]: ManyFn<TTables[K], K & string>;
  };
}

export type RelationsBuilderColumns<
  TTable extends SchemaEntry,
  TTableName extends string,
> = {
  [K in keyof GetTableColumns<TTable>]: RelationsBuilderColumn<TTableName>;
};

export type GetTableColumns<TTable extends SchemaEntry> =
  TTable extends ConvexTable<any>
    ? TTable['_']['columns'] &
        SystemFields<TTable['_']['name']> &
        SystemFieldAliases<TTable['_']['name'], TTable['_']['columns']>
    : never;

export type RelationsBuilderTables<TSchema extends Schema> = {
  [TTableName in keyof TSchema]: RelationsBuilderColumns<
    TSchema[TTableName],
    TTableName & string
  > &
    RelationsBuilderTable<TTableName & string>;
};

export type RelationsBuilder<TSchema extends Schema> =
  RelationsBuilderTables<TSchema> & RelationsHelperStatic<TSchema>;

export type RelationsBuilderConfigValue = RelationsRecord | undefined;

export type RelationsBuilderConfig<TTables extends Schema> = {
  [TTableName in keyof TTables]?: RelationsBuilderConfigValue;
};

export type AnyRelationsBuilderConfig = Record<
  string,
  RelationsBuilderConfigValue
>;

export function createRelationsHelper<TTables extends Schema>(
  tables: TTables
): RelationsBuilder<TTables> {
  const helperStatic = new RelationsHelperStatic(tables);
  const relationsTables = Object.entries(tables).reduce<
    Record<string, RelationsBuilderTable>
  >((acc, [tKey, value]) => {
    const rTable = new RelationsBuilderTable(value, tKey);
    const columns = Object.entries(getTableColumns(value)).reduce<
      Record<string, RelationsBuilderColumnBase>
    >((colsAcc, [cKey, column]) => {
      colsAcc[cKey] = new RelationsBuilderColumn(column, tKey, cKey);
      return colsAcc;
    }, {});

    const relationsTable = Object.assign(rTable, columns);
    Object.defineProperty(relationsTable, '_id', {
      get() {
        throw new Error('`_id` is no longer public in relations. Use `id`.');
      },
      enumerable: false,
      configurable: false,
    });
    acc[tKey] = relationsTable;
    return acc;
  }, {});

  return Object.assign(helperStatic, relationsTables) as any;
}

export function extractTablesFromSchema<
  TSchema extends Record<string, unknown>,
>(schema: TSchema): ExtractTablesFromSchema<TSchema> {
  return Object.fromEntries(
    Object.entries(schema).filter(([_, e]) => isConvexTable(e))
  ) as ExtractTablesFromSchema<TSchema>;
}

// ============================================================================
// Relation classes
// ============================================================================

export type RelationsRecord = Record<string, AnyRelation>;
export type AnyRelations = TablesRelationalConfig;

export abstract class Relation<TTargetTableName extends string = string> {
  static readonly [entityKind]: string = 'RelationV2';
  declare readonly $brand: 'RelationV2';
  declare readonly relationType: 'many' | 'one';

  fieldName!: string;
  sourceColumns!: ColumnBuilder<any, any, any>[];
  targetColumns!: ColumnBuilder<any, any, any>[];
  alias: string | undefined;
  where: Record<string, unknown> | undefined;
  sourceTable!: SchemaEntry;
  targetTable: SchemaEntry;
  through?: {
    source: RelationsBuilderColumnBase[];
    target: RelationsBuilderColumnBase[];
  };
  throughTable?: SchemaEntry;
  isReversed?: boolean;

  /** @internal */
  sourceColumnTableNames: string[] = [];
  /** @internal */
  targetColumnTableNames: string[] = [];

  constructor(
    targetTable: SchemaEntry,
    readonly targetTableName: TTargetTableName
  ) {
    this.targetTable = targetTable;
  }
}

export type AnyRelation = Relation<string>;

export class One<
  TTargetTableName extends string,
  TOptional extends boolean = boolean,
> extends Relation<TTargetTableName> {
  static override readonly [entityKind]: string = 'OneV2';
  protected declare $relationBrand: 'OneV2';

  override readonly relationType = 'one' as const;

  readonly optional: TOptional;

  constructor(
    tables: Schema,
    targetTable: SchemaEntry,
    targetTableName: TTargetTableName,
    config: AnyOneConfig | undefined
  ) {
    super(targetTable, targetTableName);
    this.alias = config?.alias;
    this.where = config?.where;

    if (config?.from) {
      this.sourceColumns = (
        Array.isArray(config.from) ? config.from : [config.from]
      ).map((it) => {
        this.throughTable ??= it._.through
          ? (tables[it._.through._.tableName] as SchemaEntry)
          : undefined;
        this.sourceColumnTableNames.push(it._.tableName);
        return it._.column;
      });
    }

    if (config?.to) {
      this.targetColumns = (
        Array.isArray(config.to) ? config.to : [config.to]
      ).map((it) => {
        this.throughTable ??= it._.through
          ? (tables[it._.through._.tableName] as SchemaEntry)
          : undefined;
        this.targetColumnTableNames.push(it._.tableName);
        return it._.column;
      });
    }

    if (this.throughTable) {
      this.through = {
        source: (Array.isArray(config?.from)
          ? config.from
          : config?.from
            ? [config.from]
            : []
        ).map((c) => c._.through!),
        target: (Array.isArray(config?.to)
          ? config.to
          : config?.to
            ? [config.to]
            : []
        ).map((c) => c._.through!),
      };
    }

    this.optional = (config?.optional ?? true) as TOptional;
  }
}

export type AnyOne = One<string, boolean>;

export class Many<
  TTargetTableName extends string,
> extends Relation<TTargetTableName> {
  static override readonly [entityKind]: string = 'ManyV2';
  protected declare $relationBrand: 'ManyV2';

  override readonly relationType = 'many' as const;

  constructor(
    tables: Schema,
    targetTable: SchemaEntry,
    targetTableName: TTargetTableName,
    readonly config: AnyManyConfig | undefined
  ) {
    super(targetTable, targetTableName);
    this.alias = config?.alias;
    this.where = config?.where;

    if (config?.from) {
      this.sourceColumns = (
        Array.isArray(config.from) ? config.from : [config.from]
      ).map((it) => {
        this.throughTable ??= it._.through
          ? (tables[it._.through._.tableName] as SchemaEntry)
          : undefined;
        this.sourceColumnTableNames.push(it._.tableName);
        return it._.column;
      });
    }

    if (config?.to) {
      this.targetColumns = (
        Array.isArray(config.to) ? config.to : [config.to]
      ).map((it) => {
        this.throughTable ??= it._.through
          ? (tables[it._.through._.tableName] as SchemaEntry)
          : undefined;
        this.targetColumnTableNames.push(it._.tableName);
        return it._.column;
      });
    }

    if (this.throughTable) {
      this.through = {
        source: (Array.isArray(config?.from)
          ? config.from
          : config?.from
            ? [config.from]
            : []
        ).map((c) => c._.through!),
        target: (Array.isArray(config?.to)
          ? config.to
          : config?.to
            ? [config.to]
            : []
        ).map((c) => c._.through!),
      };
    }
  }
}

export type AnyMany = Many<string>;

// ============================================================================
// Relational config
// ============================================================================

export interface TableRelationalConfig {
  defaults?: OrmRuntimeDefaults;
  name: string;
  relations: RelationsRecord;
  strict?: boolean;
  table: SchemaEntry;
}

export type TablesRelationalConfig<
  SchemaDef extends SchemaDefinition<any, boolean> = SchemaDefinition<
    any,
    true
  >,
  Tables extends Record<string, TableRelationalConfig> = Record<
    string,
    TableRelationalConfig
  >,
> = Tables & {
  [OrmSchemaDefinition]?: SchemaDef;
};

type RelationsConfigWithSchema<
  TConfig extends AnyRelationsBuilderConfig,
  TTables extends Schema,
> = TablesRelationalConfig<
  SchemaDefinition<TTables, true>,
  ExtractTablesWithRelations<TConfig, TTables>
>;

type RelationsPartsConfigWithSchema<
  TConfig extends AnyRelationsBuilderConfig,
  TTables extends Schema,
> = TablesRelationalConfig<
  SchemaDefinition<TTables, true>,
  ExtractTablesWithRelationsParts<TConfig, TTables>
>;

// ============================================================================
// Relations filter types (v1)
// ============================================================================

export type Placeholder = {
  readonly __placeholder?: true;
};

export type SQLWrapper = {
  readonly __sqlWrapper?: true;
};

export interface SQLOperator {
  sql: (...args: any[]) => unknown;
}

export interface RelationFieldsFilterInternals<T> {
  AND?: RelationsFieldFilter<T>[] | undefined;
  arrayContained?:
    | (T extends Array<infer E> ? (E | Placeholder)[] : (T | Placeholder)[])
    | Placeholder
    | undefined;
  arrayContains?:
    | (T extends Array<infer E> ? (E | Placeholder)[] : (T | Placeholder)[])
    | Placeholder
    | undefined;
  arrayOverlaps?:
    | (T extends Array<infer E> ? (E | Placeholder)[] : (T | Placeholder)[])
    | Placeholder
    | undefined;
  between?: [T | Placeholder, T | Placeholder] | Placeholder | undefined;
  contains?: string | Placeholder | undefined;
  endsWith?: string | Placeholder | undefined;
  eq?: T | Placeholder | undefined;
  gt?: T | Placeholder | undefined;
  gte?: T | Placeholder | undefined;
  ilike?: string | Placeholder | undefined;
  in?: (T | Placeholder)[] | Placeholder | undefined;
  isNotNull?: true | undefined;
  isNull?: true | undefined;
  like?: string | Placeholder | undefined;
  lt?: T | Placeholder | undefined;
  lte?: T | Placeholder | undefined;
  NOT?: RelationsFieldFilter<T> | undefined;
  ne?: T | Placeholder | undefined;
  notBetween?: [T | Placeholder, T | Placeholder] | Placeholder | undefined;
  notIlike?: string | Placeholder | undefined;
  notIn?: (T | Placeholder)[] | Placeholder | undefined;
  notLike?: string | Placeholder | undefined;
  OR?: RelationsFieldFilter<T>[] | undefined;
  startsWith?: string | Placeholder | undefined;
}

export type RelationsFieldFilter<T = unknown> =
  | RelationFieldsFilterInternals<T>
  | (unknown extends T
      ? never
      : T extends string | number | boolean | bigint | null | undefined
        ? T
        : T extends object
          ? never
          : T)
  | Placeholder;

export interface RelationsFilterCommons<
  TTable extends TableRelationalConfig = TableRelationalConfig,
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> {
  AND?: RelationsFilter<TTable, TSchema>[] | undefined;
  NOT?: RelationsFilter<TTable, TSchema> | undefined;
  OR?: RelationsFilter<TTable, TSchema>[] | undefined;
  RAW?:
    | SQLWrapper
    | ((table: TTable['table'], operators: SQLOperator) => unknown)
    | undefined;
}

export type RelationsFilterColumns<TColumns extends Record<string, unknown>> = {
  [K in keyof TColumns]?:
    | (TColumns[K] extends { _: { data: infer Data } }
        ? RelationsFieldFilter<Data>
        : RelationsFieldFilter<unknown>)
    | undefined;
};

export type FindTargetTableInRelationalConfig<
  TConfig extends TablesRelationalConfig,
  TRelation extends AnyRelation,
> = TConfig[TRelation['targetTableName']];

export type RelationsFilterRelations<
  TTable extends TableRelationalConfig,
  TSchema extends TablesRelationalConfig,
  TRelations extends RelationsRecord = TTable['relations'],
> = {
  [K in keyof TRelations]?:
    | boolean
    | RelationsFilter<
        FindTargetTableInRelationalConfig<TSchema, TRelations[K]>,
        TSchema
      >
    | undefined;
};

export type RelationsFilter<
  TTable extends TableRelationalConfig,
  TSchema extends TablesRelationalConfig,
  TColumns extends Record<string, unknown> = GetTableColumns<TTable['table']>,
> =
  TTable['relations'] extends Record<string, never>
    ? TableFilter<TTable['table']>
    : Simplify<
        RelationsFilterColumns<TColumns> &
          RelationsFilterRelations<TTable, TSchema> &
          RelationsFilterCommons<TTable, TSchema>
      >;

export interface TableFilterCommons<
  TTable extends SchemaEntry = SchemaEntry,
  TColumns extends Record<string, unknown> = GetTableColumns<TTable>,
> {
  AND?: TableFilter<TTable, TColumns>[] | undefined;
  NOT?: TableFilter<TTable, TColumns> | undefined;
  OR?: TableFilter<TTable, TColumns>[] | undefined;
  RAW?:
    | SQLWrapper
    | ((table: TTable, operators: SQLOperator) => unknown)
    | undefined;
}

export type TableFilterColumns<TColumns extends Record<string, unknown>> = {
  [K in keyof TColumns]?:
    | (TColumns[K] extends { _: { data: infer Data } }
        ? RelationsFieldFilter<Data>
        : RelationsFieldFilter<unknown>)
    | undefined;
};

export type TableFilter<
  TTable extends SchemaEntry = SchemaEntry,
  TColumns extends Record<string, unknown> = GetTableColumns<TTable>,
> = Simplify<
  TableFilterColumns<TColumns> & TableFilterCommons<TTable, TColumns>
>;

export type ExtractTablesWithRelations<
  TConfig extends AnyRelationsBuilderConfig,
  TTables extends Schema,
> = {
  [K in keyof TTables]: {
    table: TTables[K];
    name: K & string;
    relations: TConfig extends { [CK in K]: Record<string, any> }
      ? TConfig[K]
      : {};
  };
};

export type ExtractTablesWithRelationsParts<
  TConfig extends AnyRelationsBuilderConfig,
  TTables extends Schema,
> = {
  [K in NonUndefinedKeysOnly<TConfig> & keyof TTables]: {
    table: TTables[K & string];
    name: K & string;
    relations: TConfig[K] extends Record<string, any> ? TConfig[K] : {};
  };
};

export type NonUndefinedKeysOnly<T> = {
  [K in keyof T]: T[K] extends undefined ? never : K;
}[keyof T];

// ============================================================================
// defineRelations
// ============================================================================

export function buildRelations<
  TTables extends Schema,
  TConfig extends AnyRelationsBuilderConfig,
>(
  tables: TTables,
  config: TConfig,
  strict?: boolean,
  defaults?: OrmRuntimeDefaults
): ExtractTablesWithRelations<TConfig, TTables> {
  const tablesConfig = {} as TablesRelationalConfig;

  for (const [tsName, table] of Object.entries(tables)) {
    tablesConfig[tsName] = {
      table: table as SchemaEntry,
      name: tsName,
      relations: (config as AnyRelationsBuilderConfig)[tsName] ?? {},
      strict,
      defaults,
    };
  }

  return processRelations(tablesConfig, tables) as any;
}

export function buildRelationsParts<
  TTables extends Schema,
  TConfig extends AnyRelationsBuilderConfig,
>(
  tables: TTables,
  config: TConfig,
  strict?: boolean,
  defaults?: OrmRuntimeDefaults
): ExtractTablesWithRelationsParts<TConfig, TTables> {
  const tablesConfig = {} as TablesRelationalConfig;

  for (const [tsName, relations] of Object.entries(config)) {
    if (!relations || !tables[tsName]) continue;
    tablesConfig[tsName] = {
      table: tables[tsName] as SchemaEntry,
      name: tsName,
      relations,
      strict,
      defaults,
    };
  }

  return processRelations(tablesConfig, tables) as any;
}

/** Builds relational config for every table in schema */
export function defineRelations<
  TSchema extends Record<string, unknown>,
  TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(schema: TSchema): RelationsConfigWithSchema<{}, TTables>;
/** Builds relational config for every table in schema */
export function defineRelations<
  TSchema extends Record<string, unknown>,
  TConfig extends RelationsBuilderConfig<TTables>,
  TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
  schema: TSchema,
  relations: (helpers: RelationsBuilder<TTables>) => TConfig
): RelationsConfigWithSchema<TConfig, TTables>;
export function defineRelations(
  schema: Record<string, unknown>,
  relations?: (helpers: RelationsBuilder<Schema>) => AnyRelationsBuilderConfig
): TablesRelationalConfig {
  const tables = extractTablesFromSchema(schema);
  const schemaOptions = (schema as { [OrmSchemaOptions]?: OrmRuntimeOptions })[
    OrmSchemaOptions
  ];
  const strict = schemaOptions?.strict ?? true;
  const defaults = schemaOptions?.defaults;
  const schemaDefinition = (schema as { [OrmSchemaDefinition]?: unknown })[
    OrmSchemaDefinition
  ];
  const pluginTableNames = (
    schema as {
      [OrmSchemaPluginTables]?: readonly string[];
    }
  )[OrmSchemaPluginTables];
  const config = relations
    ? relations(createRelationsHelper(tables) as RelationsBuilder<Schema>)
    : {};
  const tablesConfig = buildRelations(tables, config, strict, defaults);
  Object.defineProperty(tablesConfig, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  if (schemaDefinition) {
    Object.defineProperty(tablesConfig, OrmSchemaDefinition, {
      value: schemaDefinition,
      enumerable: false,
    });
  }
  if (pluginTableNames) {
    Object.defineProperty(tablesConfig, OrmSchemaPluginTables, {
      value: pluginTableNames,
      enumerable: false,
    });
  }
  return tablesConfig as RelationsConfigWithSchema<
    AnyRelationsBuilderConfig,
    Schema
  >;
}

/** Builds relational config only for tables present in relational config */
export function defineRelationsPart<
  TSchema extends Record<string, unknown>,
  TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
  schema: TSchema
): RelationsPartsConfigWithSchema<IncludeEveryTable<TTables>, TTables>;
/** Builds relational config only for tables present in relational config */
export function defineRelationsPart<
  TSchema extends Record<string, unknown>,
  TConfig extends RelationsBuilderConfig<TTables>,
  TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
  schema: TSchema,
  relations: (helpers: RelationsBuilder<TTables>) => TConfig
): RelationsPartsConfigWithSchema<TConfig, TTables>;
export function defineRelationsPart(
  schema: Record<string, unknown>,
  relations?: (helpers: RelationsBuilder<Schema>) => AnyRelationsBuilderConfig
): TablesRelationalConfig {
  const tables = extractTablesFromSchema(schema);
  const schemaOptions = (schema as { [OrmSchemaOptions]?: OrmRuntimeOptions })[
    OrmSchemaOptions
  ];
  const strict = schemaOptions?.strict ?? true;
  const defaults = schemaOptions?.defaults;
  const schemaDefinition = (schema as { [OrmSchemaDefinition]?: unknown })[
    OrmSchemaDefinition
  ];
  const pluginTableNames = (
    schema as {
      [OrmSchemaPluginTables]?: readonly string[];
    }
  )[OrmSchemaPluginTables];
  const config = relations
    ? relations(createRelationsHelper(tables) as RelationsBuilder<Schema>)
    : (Object.fromEntries(
        Object.keys(tables).map((k) => [k, {}])
      ) as AnyRelationsBuilderConfig);

  const tablesConfig = buildRelationsParts(tables, config, strict, defaults);
  Object.defineProperty(tablesConfig, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  if (schemaDefinition) {
    Object.defineProperty(tablesConfig, OrmSchemaDefinition, {
      value: schemaDefinition,
      enumerable: false,
    });
  }
  if (pluginTableNames) {
    Object.defineProperty(tablesConfig, OrmSchemaPluginTables, {
      value: pluginTableNames,
      enumerable: false,
    });
  }
  return tablesConfig as RelationsPartsConfigWithSchema<
    AnyRelationsBuilderConfig,
    Schema
  >;
}

// ============================================================================
// processRelations
// ============================================================================

export function processRelations(
  tablesConfig: TablesRelationalConfig,
  tables: Schema
): TablesRelationalConfig {
  for (const tableConfig of Object.values(tablesConfig)) {
    for (const [relationFieldName, relation] of Object.entries(
      tableConfig.relations
    )) {
      if (!isRelation(relation)) continue;
      relation.sourceTable = tableConfig.table;
      relation.fieldName = relationFieldName;
    }
  }

  for (const [sourceTableName, tableConfig] of Object.entries(tablesConfig)) {
    for (const [relationFieldName, relation] of Object.entries(
      tableConfig.relations
    )) {
      if (!isRelation(relation)) continue;

      let reverseRelation: Relation | undefined;
      const {
        targetTableName,
        alias,
        sourceColumns,
        targetColumns,
        throughTable,
        sourceTable,
        through,
        where,
        sourceColumnTableNames,
        targetColumnTableNames,
      } = relation;

      const relationPrintName = `relations -> ${tableConfig.name}: { ${relationFieldName}: r.${
        relation.relationType === 'one' ? 'one' : 'many'
      }.${targetTableName}(...) }`;

      if (relationFieldName in getTableColumns(tableConfig.table)) {
        throw new Error(
          `${relationPrintName}: relation name collides with column "${relationFieldName}" of table "${tableConfig.name}"`
        );
      }

      if (typeof alias === 'string' && !alias) {
        throw new Error(`${relationPrintName}: "alias" cannot be empty`);
      }

      if (sourceColumns?.length === 0) {
        throw new Error(`${relationPrintName}: "from" cannot be empty`);
      }

      if (targetColumns?.length === 0) {
        throw new Error(`${relationPrintName}: "to" cannot be empty`);
      }

      if (sourceColumns && targetColumns) {
        if (sourceColumns.length !== targetColumns.length && !throughTable) {
          throw new Error(
            `${relationPrintName}: "from" and "to" must have same length`
          );
        }

        for (const sName of sourceColumnTableNames) {
          if (sName !== sourceTableName) {
            throw new Error(
              `${relationPrintName}: all "from" columns must belong to table "${sourceTableName}", found "${sName}"`
            );
          }
        }
        for (const tName of targetColumnTableNames) {
          if (tName !== targetTableName) {
            throw new Error(
              `${relationPrintName}: all "to" columns must belong to table "${targetTableName}", found "${tName}"`
            );
          }
        }

        if (through) {
          if (
            through.source.length !== sourceColumns.length ||
            through.target.length !== targetColumns.length
          ) {
            throw new Error(
              `${relationPrintName}: .through() must be used on all columns in "from" and "to" or none`
            );
          }

          for (const column of through.source) {
            if (tables[column._.tableName] !== throughTable) {
              throw new Error(
                `${relationPrintName}: .through() must use same table for all columns`
              );
            }
          }

          for (const column of through.target) {
            if (tables[column._.tableName] !== throughTable) {
              throw new Error(
                `${relationPrintName}: .through() must use same table for all columns`
              );
            }
          }
        }

        continue;
      }

      if (sourceColumns || targetColumns) {
        throw new Error(
          `${relationPrintName}: relation must have both "from" and "to" or none`
        );
      }

      const reverseTableConfig = tablesConfig[targetTableName];
      if (!reverseTableConfig) {
        throw new Error(
          `${relationPrintName}: missing "from"/"to" and no reverse relation found for "${targetTableName}"`
        );
      }

      if (alias) {
        const reverseRelations = Object.values(
          reverseTableConfig.relations
        ).filter(
          (it): it is Relation =>
            isRelation(it) && it.alias === alias && it !== relation
        );
        if (reverseRelations.length > 1) {
          throw new Error(
            `${relationPrintName}: multiple reverse relations with alias "${alias}" found`
          );
        }
        reverseRelation = reverseRelations[0];
        if (!reverseRelation) {
          throw new Error(
            `${relationPrintName}: no reverse relation with alias "${alias}" found in "${targetTableName}"`
          );
        }
      } else {
        const reverseRelations = Object.values(
          reverseTableConfig.relations
        ).filter(
          (it): it is Relation =>
            isRelation(it) &&
            it.targetTable === sourceTable &&
            !it.alias &&
            it !== relation
        );
        if (reverseRelations.length > 1) {
          throw new Error(
            `${relationPrintName}: multiple relations between "${targetTableName}" and "${sourceTableName}"; use alias`
          );
        }
        reverseRelation = reverseRelations[0];
        if (!reverseRelation) {
          throw new Error(
            `${relationPrintName}: no reverse relation between "${targetTableName}" and "${sourceTableName}"`
          );
        }
      }

      if (!reverseRelation.sourceColumns || !reverseRelation.targetColumns) {
        throw new Error(
          `${relationPrintName}: reverse relation "${targetTableName}.${reverseRelation.fieldName}" missing "from"/"to"`
        );
      }

      relation.sourceColumns = reverseRelation.targetColumns;
      relation.targetColumns = reverseRelation.sourceColumns;
      relation.through = reverseRelation.through
        ? {
            source: reverseRelation.through.target,
            target: reverseRelation.through.source,
          }
        : undefined;
      relation.throughTable = reverseRelation.throughTable;
      relation.isReversed = !where;
      relation.where = where ?? reverseRelation.where;
    }
  }

  return tablesConfig;
}

// ============================================================================
// Helpers
// ============================================================================

function isConvexTable(value: unknown): value is ConvexTable<any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tableName' in value &&
    Columns in (value as any)
  );
}

function isRelation(value: unknown): value is Relation {
  return value instanceof Relation;
}

function getTableColumns(
  table: ConvexTable<any>
): Record<string, ColumnBuilder<any, any, any>> {
  const columns = table[Columns] as Record<
    string,
    ColumnBuilder<any, any, any>
  >;
  const system: Record<string, ColumnBuilder<any, any, any>> = {};

  if ((table as any).id) {
    system.id = (table as any).id as ColumnBuilder<any, any, any>;
  }
  if ((table as any).createdAt || (table as any)._creationTime) {
    system.createdAt = ((table as any)._creationTime ??
      (table as any).createdAt) as ColumnBuilder<any, any, any>;
  }

  return { ...columns, ...system };
}
