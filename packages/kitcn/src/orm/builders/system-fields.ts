/**
 * System Fields - Convex-provided fields available on all documents
 *
 * id: Document ID (string, backed by internal Convex _id)
 * createdAt: Creation timestamp alias (backed by internal Convex _creationTime)
 *
 * These are automatically added to every Convex table.
 */

import { v } from 'convex/values';
import {
  ColumnBuilder,
  type ColumnBuilderBaseConfig,
  type ColumnBuilderWithTableName,
  entityKind,
} from './column-builder';

/**
 * System ID field builder (public id, internal _id)
 * Always present, always non-null
 */
type ConvexSystemIdConfig = ColumnBuilderBaseConfig<
  'string',
  'ConvexSystemId'
> & {
  data: string;
  driverParam: string;
  enumValues: undefined;
};

export class ConvexSystemIdBuilder<
  _TTableName extends string,
> extends ColumnBuilder<ConvexSystemIdConfig, {}, { notNull: true }> {
  static readonly [entityKind]: string = 'ConvexSystemIdBuilder';
  readonly [entityKind]: string = 'ConvexSystemIdBuilder';

  constructor() {
    super('_id', 'string', 'ConvexSystemId');
    // System fields are always non-null
    this.config.notNull = true;
  }

  build() {
    // _id is always a string in Convex
    return v.string();
  }

  /**
   * Convex validator - runtime access
   * System fields use v.string() for _id
   */
  get convexValidator() {
    return this.build();
  }
}

/**
 * System creation time field builder (_creationTime)
 * Always present, always non-null, always a number (milliseconds)
 */
type ConvexSystemCreationTimeConfig = ColumnBuilderBaseConfig<
  'number',
  'ConvexSystemCreationTime'
> & {
  data: number;
  driverParam: number;
  enumValues: undefined;
};

export class ConvexSystemCreationTimeBuilder extends ColumnBuilder<
  ConvexSystemCreationTimeConfig,
  {},
  { notNull: true }
> {
  static readonly [entityKind]: string = 'ConvexSystemCreationTimeBuilder';
  readonly [entityKind]: string = 'ConvexSystemCreationTimeBuilder';

  constructor() {
    super('_creationTime', 'number', 'ConvexSystemCreationTime');
    // System fields are always non-null
    this.config.notNull = true;
  }

  build() {
    // _creationTime is always a number (float64 in Convex)
    return v.number();
  }

  /**
   * Convex validator - runtime access
   * System fields use v.number() for _creationTime
   */
  get convexValidator() {
    return this.build();
  }
}

type ConvexSystemCreatedAtConfig = ColumnBuilderBaseConfig<
  'number',
  'ConvexSystemCreatedAt'
> & {
  data: number;
  driverParam: number;
  enumValues: undefined;
};

export class ConvexSystemCreatedAtBuilder extends ColumnBuilder<
  ConvexSystemCreatedAtConfig,
  {},
  { notNull: true }
> {
  static readonly [entityKind]: string = 'ConvexSystemCreatedAtBuilder';
  readonly [entityKind]: string = 'ConvexSystemCreatedAtBuilder';

  constructor() {
    super('_creationTime', 'number', 'ConvexSystemCreatedAt');
    this.config.notNull = true;
  }

  build() {
    return v.number();
  }

  get convexValidator() {
    return this.build();
  }
}

/**
 * Create system field builders for a table
 * These are automatically added to every ConvexTable
 */
export type SystemFields<TName extends string> = {
  id: ColumnBuilderWithTableName<ConvexSystemIdBuilder<TName>, TName>;
};

export type InternalSystemFields<TName extends string> = {
  _creationTime: ColumnBuilderWithTableName<
    ConvexSystemCreationTimeBuilder,
    TName
  >;
};

export type SystemFieldAliases<
  TName extends string,
  TColumns extends Record<string, unknown> = {},
> = 'createdAt' extends keyof TColumns
  ? {}
  : {
      createdAt: ColumnBuilderWithTableName<
        ConvexSystemCreatedAtBuilder,
        TName
      >;
    };

export type SystemFieldsWithAliases<
  TName extends string,
  TColumns extends Record<string, unknown> = {},
> = SystemFields<TName> &
  InternalSystemFields<TName> &
  SystemFieldAliases<TName, TColumns>;

export function createSystemFields<TName extends string>(
  tableName: TName
): SystemFieldsWithAliases<TName> {
  const id = new ConvexSystemIdBuilder<TName>();
  const creationTime = new ConvexSystemCreationTimeBuilder();
  const createdAt = new ConvexSystemCreatedAtBuilder();

  // Store table name for runtime introspection
  (id as any).config.tableName = tableName;
  (creationTime as any).config.tableName = tableName;
  (createdAt as any).config.tableName = tableName;

  return {
    id: id as ColumnBuilderWithTableName<ConvexSystemIdBuilder<TName>, TName>,
    _creationTime: creationTime as ColumnBuilderWithTableName<
      ConvexSystemCreationTimeBuilder,
      TName
    >,
    createdAt: createdAt as ColumnBuilderWithTableName<
      ConvexSystemCreatedAtBuilder,
      TName
    >,
  };
}
