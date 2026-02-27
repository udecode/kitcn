/**
 * Column Builders - Public API
 *
 * Drizzle-style column builders for Convex schemas.
 * Export all builder classes and factory functions.
 */

// BigInt builder
export {
  bigint,
  ConvexBigIntBuilder,
  type ConvexBigIntBuilderInitial,
} from './bigint';
// Boolean builder
export {
  boolean,
  ConvexBooleanBuilder,
  type ConvexBooleanBuilderInitial,
} from './boolean';
// Bytes builder
export {
  bytes,
  ConvexBytesBuilder,
  type ConvexBytesBuilderInitial,
} from './bytes';
// Base classes
export {
  type AnyColumn,
  ColumnBuilder,
  type ColumnBuilderBaseConfig,
  type ColumnBuilderRuntimeConfig,
  type ColumnBuilderTypeConfig,
  type ColumnBuilderWithTableName,
  type ColumnDataType,
  type DrizzleEntity,
  entityKind,
  type HasDefault,
  type IsPrimaryKey,
  type IsUnique,
  type NotNull,
} from './column-builder';
export { ConvexColumnBuilder } from './convex-column-builder';
// Custom builder
export {
  arrayOf,
  ConvexCustomBuilder,
  type ConvexCustomBuilderInitial,
  custom,
  json,
  objectOf,
} from './custom';
// Date builder
export {
  ConvexDateBuilder,
  type ConvexDateBuilderInitial,
  type ConvexDateMode,
  date,
} from './date';
// ID builder (Convex-specific)
export {
  ConvexIdBuilder,
  type ConvexIdBuilderInitial,
  id,
} from './id';
// Number builder
export {
  ConvexNumberBuilder,
  type ConvexNumberBuilderInitial,
  integer,
} from './number';
// System fields
export {
  ConvexSystemCreatedAtBuilder,
  ConvexSystemCreationTimeBuilder,
  ConvexSystemIdBuilder,
  createSystemFields,
  type SystemFieldAliases,
  type SystemFields,
  type SystemFieldsWithAliases,
} from './system-fields';
// Text builder
export {
  ConvexTextBuilder,
  type ConvexTextBuilderInitial,
  text,
} from './text';
export {
  ConvexTextEnumBuilder,
  type ConvexTextEnumBuilderInitial,
  textEnum,
} from './text-enum';
export {
  ConvexTimestampBuilder,
  type ConvexTimestampBuilderInitial,
  type ConvexTimestampMode,
  timestamp,
} from './timestamp';
// Vector builder (Convex vector search)
export {
  ConvexVectorBuilder,
  type ConvexVectorBuilderInitial,
  vector,
} from './vector';
