/**
 * ID Column Builder
 *
 * Creates ID reference columns in Convex tables (foreign keys).
 * Maps to Convex v.id(tableName) or v.optional(v.id(tableName)).
 *
 * Note: Convex IDs are branded strings (GenericId<TableName>).
 *
 * @example
 * id('users').notNull() → v.id('users')
 * id('cities') → v.optional(v.id('cities'))
 */

import type { GenericId, Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

/**
 * Initial type for ConvexIdBuilder
 * Includes table name in type for branded Id
 */
export type ConvexIdBuilderInitial<
  TName extends string,
  TTableName extends string,
> = ConvexIdBuilder<{
  name: TName;
  dataType: 'string';
  columnType: 'ConvexId';
  data: GenericId<TTableName>;
  driverParam: GenericId<TTableName>;
  enumValues: undefined;
}>;

/**
 * ID column builder class
 * Compiles to v.id(tableName) or v.optional(v.id(tableName))
 */
export class ConvexIdBuilder<
  T extends ColumnBuilderBaseConfig<'string', 'ConvexId'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexIdBuilder';

  constructor(
    name: T['name'],
    private tableName: string
  ) {
    super(name, 'string', 'ConvexId');
    this.config.referenceTable = tableName;
  }

  /**
   * Expose Convex validator for schema integration
   */
  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.id(this.tableName);
    }
    return v.optional(v.union(v.null(), v.id(this.tableName)));
  }

  /**
   * Compile to Convex validator
   * .notNull() → v.id(tableName)
   * nullable → v.optional(v.id(tableName))
   */
  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

/**
 * id() factory function
 *
 * Creates an ID reference column builder (foreign key).
 * Requires table name to generate branded Id type.
 *
 * @example
 * id('users') → unnamed column referencing users table
 */
export function id<TTableName extends string>(
  tableName: TTableName
): ConvexIdBuilderInitial<'', TTableName>;
export function id(tableName: string) {
  return new ConvexIdBuilder('', tableName);
}
