/**
 * Column Builder - Base abstract class for all column builders
 *
 * Follows Drizzle ORM pattern:
 * - Phantom `_` property for type-level metadata (never instantiated)
 * - Runtime `config` object for actual state
 * - Chaining methods return branded types
 * - entityKind symbol for runtime type checking
 *
 * @example
 * text().notNull() → ConvexTextBuilder with { notNull: true }
 * integer().default(0) → ConvexIntegerBuilder with { hasDefault: true }
 */

import type { Validator } from 'convex/values';
import type { Simplify } from '../../internal/types';

/**
 * Core data types supported by column builders
 * Maps to Convex types: string, number (float64), boolean, bigint (int64), vector
 */
export type ColumnDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'bigint'
  | 'bytes'
  | 'any'
  | 'vector';

export type ForeignKeyAction =
  | 'cascade'
  | 'restrict'
  | 'no action'
  | 'set null'
  | 'set default';

export interface ColumnReferenceConfig {
  name?: string;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
}

/**
 * Base configuration for all column builders
 * Stores type-level metadata extracted by TypeScript
 * Matches Drizzle's ColumnBuilderBaseConfig structure
 */
export interface ColumnBuilderBaseConfig<
  TDataType extends ColumnDataType,
  TColumnType extends string,
> {
  columnType: TColumnType; // 'ConvexText' | 'ConvexInteger' | etc.
  data: unknown; // Actual TypeScript type (string, number, boolean, bigint)
  dataType: TDataType; // 'string' | 'number' | 'boolean' | 'bigint' | 'vector'
  driverParam: unknown; // Driver-specific parameter type (for Drizzle compatibility)
  enumValues: string[] | undefined; // Enum values if applicable
  name: string;
}

/**
 * Runtime configuration stored in builder instance
 * Updated by chaining methods (.notNull(), .default(), etc.)
 */
export interface ColumnBuilderRuntimeConfig<TData> {
  columnType: string;
  dataType: string;
  default: TData | undefined;
  defaultFn?: (() => unknown) | undefined;
  foreignKeyConfigs: {
    ref: () => ColumnBuilderBase;
    config: ColumnReferenceConfig;
  }[];
  hasDefault: boolean;
  isUnique: boolean;
  name: string;
  notNull: boolean;
  onUpdateFn?: (() => unknown) | undefined;
  primaryKey: boolean;
  referenceTable?: string;
  table?: unknown;
  tableName?: string;
  uniqueName?: string;
  uniqueNulls?: 'distinct' | 'not distinct';
}

/**
 * Phantom type configuration - never instantiated, just for TypeScript
 * Tracks type-level state through method chaining
 * Matches Drizzle's exact structure
 */
export type ColumnBuilderTypeConfig<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
  TTypeConfig extends object,
> = Simplify<
  {
    brand: 'ColumnBuilder';
    name: T['name'];
    dataType: T['dataType'];
    columnType: T['columnType'];
    data: T['data'];
    driverParam: T['driverParam'];
    notNull: T extends { notNull: infer U } ? U : boolean; // Conditional inference
    hasDefault: T extends { hasDefault: infer U } ? U : boolean; // Conditional inference
    isPrimaryKey: T extends { isPrimaryKey: infer U } ? U : boolean; // Conditional inference (Drizzle uses 'identity' but we use isPrimaryKey)
    isUnique: T extends { isUnique: infer U } ? U : boolean;
    enumValues: T['enumValues'];
  } & TTypeConfig
>;

/**
 * entityKind symbol for runtime type checking
 * Following Drizzle's pattern for type guards
 */
export const entityKind = Symbol.for('kitcn:entityKind');

export interface DrizzleEntity {
  [entityKind]: string;
}

/**
 * ColumnBuilderBase interface - defines the phantom _ property
 * This interface is crucial for proper type intersection with NotNull/HasDefault/etc.
 */
export interface ColumnBuilderBase<
  T extends ColumnBuilderBaseConfig<
    ColumnDataType,
    string
  > = ColumnBuilderBaseConfig<ColumnDataType, string>,
  TTypeConfig extends object = object,
> {
  _: ColumnBuilderTypeConfig<T, TTypeConfig>;
}

/**
 * Use as the return type for self-referencing `.references()` callbacks.
 *
 * @example
 * ```ts
 * parentId: text().references((): AnyColumn => commentsTable.id, { onDelete: 'cascade' })
 * ```
 */
export type AnyColumn = ColumnBuilderBase;

/**
 * Base ColumnBuilder abstract class
 *
 * All column builders inherit from this class.
 * Implements chaining methods and stores runtime config.
 */
export abstract class ColumnBuilder<
  T extends ColumnBuilderBaseConfig<
    ColumnDataType,
    string
  > = ColumnBuilderBaseConfig<ColumnDataType, string>,
  TRuntimeConfig extends object = object,
  TTypeConfig extends object = object,
> implements ColumnBuilderBase<T, TTypeConfig>, DrizzleEntity
{
  static readonly [entityKind]: string = 'ColumnBuilder';
  readonly [entityKind]: string = 'ColumnBuilder';

  /**
   * Phantom property - never instantiated, just for types
   * Accumulates type info through method chaining
   */
  declare _: ColumnBuilderTypeConfig<T, TTypeConfig>;

  /**
   * Runtime configuration - actual mutable state
   */
  protected config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

  constructor(
    name: T['name'],
    dataType: T['dataType'],
    columnType: T['columnType']
  ) {
    this.config = {
      name,
      notNull: false,
      default: undefined,
      hasDefault: false,
      primaryKey: false,
      isUnique: false,
      uniqueName: undefined,
      uniqueNulls: undefined,
      foreignKeyConfigs: [],
      dataType,
      columnType,
    } as ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;
  }

  /**
   * Mark column as NOT NULL
   * Returns type-branded instance with notNull: true
   */
  notNull(): NotNull<this> {
    this.config.notNull = true;
    return this as NotNull<this>;
  }

  /**
   * Override the TypeScript type for this column.
   * Mirrors Drizzle's $type() (type-only, no runtime validation changes).
   */
  $type<TType>(): $Type<this, TType> {
    return this as any;
  }

  /**
   * Set default value for column
   * Makes field optional on insert
   */
  default(value: ColumnData<this>): HasDefault<this> {
    this.config.default = value as any;
    this.config.hasDefault = true;
    return this as HasDefault<this>;
  }

  /**
   * Set default function for column (runtime evaluated on insert).
   * Mirrors Drizzle's $defaultFn() / $default().
   */
  $defaultFn(fn: () => ColumnData<this>): HasDefault<this> {
    this.config.defaultFn = fn as any;
    return this as HasDefault<this>;
  }

  /**
   * Alias of $defaultFn for Drizzle parity.
   */
  $default(fn: () => ColumnData<this>): HasDefault<this> {
    return this.$defaultFn(fn);
  }

  /**
   * Set on-update function for column (runtime evaluated on update).
   * Mirrors Drizzle's $onUpdateFn() / $onUpdate().
   */
  $onUpdateFn(fn: () => ColumnData<this>): HasDefault<this> {
    this.config.onUpdateFn = fn as any;
    return this as HasDefault<this>;
  }

  /**
   * Alias of $onUpdateFn for Drizzle parity.
   */
  $onUpdate(fn: () => ColumnData<this>): HasDefault<this> {
    return this.$onUpdateFn(fn);
  }

  /**
   * Mark column as primary key
   * Implies NOT NULL
   */
  primaryKey(): IsPrimaryKey<NotNull<this>> {
    this.config.primaryKey = true;
    this.config.notNull = true;
    return this as IsPrimaryKey<NotNull<this>>;
  }

  /**
   * Mark column as UNIQUE
   * Mirrors Drizzle column unique API
   */
  unique(
    name?: string,
    config?: { nulls: 'distinct' | 'not distinct' }
  ): IsUnique<this> {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    this.config.uniqueNulls = config?.nulls;
    return this as IsUnique<this>;
  }

  /**
   * Define a foreign key reference
   * Mirrors Drizzle column references() API
   */
  references(ref: () => ColumnBuilderBase, config: ColumnReferenceConfig = {}) {
    this.config.foreignKeyConfigs.push({ ref, config });
    return this;
  }

  /**
   * Build method - must be implemented by subclasses
   * Compiles builder to Convex validator
   *
   * @returns Convex validator for this column
   */
  abstract build(): Validator<any, any, any>;
}

/**
 * Type utilities for phantom type branding
 * Drizzle's EXACT pattern - verified working
 */

/**
 * Brand a builder as NOT NULL
 * Removes | null from extracted type
 */
export type NotNull<T extends ColumnBuilderBase> = T & {
  _: {
    notNull: true;
  };
};

/**
 * Brand a builder with a table name
 * Used for relation typing (fields/references must match table)
 */
export type ColumnBuilderWithTableName<
  T extends ColumnBuilderBase,
  TTableName extends string,
> = T & {
  _: {
    tableName: TTableName;
  };
};

/**
 * Brand a builder as UNIQUE
 */
export type IsUnique<T extends ColumnBuilderBase> = T & {
  _: {
    isUnique: true;
  };
};

/**
 * Brand a builder with a default value
 * Makes field optional on insert
 */
export type HasDefault<T extends ColumnBuilderBase> = T & {
  _: {
    hasDefault: true;
  };
};

type ColumnData<TBuilder extends ColumnBuilderBase> = TBuilder['_'] extends {
  $type: infer TType;
}
  ? TType
  : TBuilder['_']['data'];

export type $Type<TBuilder extends ColumnBuilderBase, TType> = TBuilder & {
  _: { $type: TType };
};

/**
 * Brand a builder as a primary key
 * Implies NOT NULL
 */
export type IsPrimaryKey<T extends ColumnBuilderBase> = T & {
  _: {
    isPrimaryKey: true;
    notNull: true;
  };
};
