/**
 * Better Convex ORM - Drizzle-inspired schema definitions for Convex
 *
 * Milestone 1 (M1): Schema Foundation
 * @example
 * import { convexTable, InferSelectModel, InferInsertModel } from 'better-convex/orm';
 * import { v } from 'convex/values';
 *
 * const users = convexTable('users', {
 *   name: v.string(),
 *   email: v.string(),
 * });
 *
 * type User = InferSelectModel<typeof users>;
 * type NewUser = InferInsertModel<typeof users>;
 *
 * Milestone 2 (M2): Relations Layer (v1)
 * @example
 * import { defineRelations } from 'better-convex/orm';
 *
 * const relations = defineRelations({ users, posts }, (r) => ({
 *   posts: {
 *     author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
 *   },
 * }));
 *
 * Milestone 3 (M3): Query Builder - Read Operations
 * @example
 * import { createOrm } from 'better-convex/orm';
 *
 * const orm = createOrm({ schema });
 * const db = orm.db(ctx);
 * const users = await db.query.users.findMany({
 *   with: { posts: { limit: 5 } }
 * });
 *
 * Milestone 4 (M4): Query Builder - Where Filtering
 * @example
 * const activeAdults = await db.query.users.findMany({
 *   where: {
 *     status: { in: ['active', 'pending'] },
 *     age: { gt: 18 },
 *   },
 * });
 */

export type {
  DefineSchemaOptions,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
export {
  deprecated,
  pretend,
  pretendRequired,
} from '../internal/upstream/validators';
export type {
  CountBackfillChunkArgs,
  CountBackfillKickoffArgs,
  CountBackfillStatusArgs,
} from './aggregate-index/backfill';
// M6: Column Builders (Drizzle-style)
export type {
  AnyColumn,
  ColumnBuilder,
  ColumnBuilderBaseConfig,
  ColumnBuilderRuntimeConfig,
  ColumnBuilderTypeConfig,
  ColumnBuilderWithTableName,
  ColumnDataType,
  ConvexBigIntBuilder,
  ConvexBigIntBuilderInitial,
  ConvexBooleanBuilder,
  ConvexBooleanBuilderInitial,
  ConvexBytesBuilder,
  ConvexBytesBuilderInitial,
  ConvexCustomBuilder,
  ConvexCustomBuilderInitial,
  ConvexDateBuilder,
  ConvexDateBuilderInitial,
  ConvexDateMode,
  ConvexIdBuilder,
  ConvexIdBuilderInitial,
  ConvexNumberBuilder,
  ConvexNumberBuilderInitial,
  ConvexTextBuilder,
  ConvexTextBuilderInitial,
  ConvexTextEnumBuilder,
  ConvexTextEnumBuilderInitial,
  ConvexTimestampBuilder,
  ConvexTimestampBuilderInitial,
  ConvexTimestampMode,
  ConvexVectorBuilder,
  ConvexVectorBuilderInitial,
  DrizzleEntity,
  HasDefault,
  IsPrimaryKey,
  IsUnique,
  NotNull,
  SystemFields,
} from './builders';
export {
  arrayOf,
  bigint,
  boolean,
  bytes,
  custom,
  date,
  id,
  integer,
  json,
  objectOf,
  text,
  textEnum,
  timestamp,
  vector,
} from './builders';
export {
  type ConvexCheckBuilder,
  type ConvexCheckConfig,
  type ConvexForeignKeyBuilder,
  type ConvexForeignKeyConfig,
  type ConvexUniqueConstraintBuilder,
  type ConvexUniqueConstraintBuilderOn,
  type ConvexUniqueConstraintConfig,
  check,
  foreignKey,
  unique,
} from './constraints';
export type {
  CreateOrmOptions,
  GenericOrm,
  GenericOrmCtx,
  OrmApiResult,
  OrmClientBase,
  OrmClientWithApi,
  OrmFunctions,
  OrmReaderCtx,
  OrmWriterCtx,
} from './create-orm';
export { createOrm } from './create-orm';
export type {
  DatabaseWithMutations,
  DatabaseWithQuery,
  OrmReader,
  OrmWriter,
} from './database';
export { OrmNotFoundError } from './errors';
export type { EdgeMetadata } from './extractRelationsConfig';
// M2: Schema Extraction
export { extractRelationsConfig } from './extractRelationsConfig';
// M4: Filter Expressions
export type {
  BinaryExpression,
  ExpressionVisitor,
  FieldReference,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
// M5: String Operators
export {
  and,
  between,
  contains,
  endsWith,
  eq,
  fieldRef,
  gt,
  gte,
  ilike,
  inArray,
  isFieldReference,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notInArray,
  or,
  startsWith,
} from './filter-expression';
// M1: Index Builders (Drizzle-style)
export {
  aggregateIndex,
  type ConvexAggregateIndexBuilder,
  type ConvexAggregateIndexBuilderOn,
  type ConvexIndexBuilder,
  type ConvexIndexBuilderOn,
  type ConvexRankIndexBuilder,
  type ConvexRankIndexBuilderOn,
  type ConvexSearchIndexBuilder,
  type ConvexSearchIndexBuilderOn,
  type ConvexSearchIndexConfig,
  type ConvexVectorIndexBuilder,
  type ConvexVectorIndexBuilderOn,
  type ConvexVectorIndexConfig,
  index,
  rankIndex,
  searchIndex,
  uniqueIndex,
  vectorIndex,
} from './indexes';
export {
  getTableColumns,
  getTableConfig,
  type TableConfigResult,
} from './introspection';
export type {
  MigrationAppliedState,
  MigrationCancelArgs,
  MigrationDefinition,
  MigrationDirection,
  MigrationDoc,
  MigrationDocContext,
  MigrationDriftIssue,
  MigrationManifestEntry,
  MigrationMigrateOne,
  MigrationPlan,
  MigrationRunArgs,
  MigrationRunChunkArgs,
  MigrationRunStatus,
  MigrationSet,
  MigrationStateMap,
  MigrationStatusArgs,
  MigrationStep,
  MigrationTableName,
  MigrationWriteMode,
} from './migrations';
export {
  buildMigrationPlan,
  defineMigration,
  defineMigrationSet,
  detectMigrationDrift,
} from './migrations';
// M5: OrderBy
export { asc, desc } from './order-by';
export type {
  DocByCtx,
  LookupByIdResultByCtx,
  QueryCtxWithOptionalOrmQueryTable,
  QueryCtxWithOrmQueryTable,
  QueryCtxWithPreferredOrmQueryTable,
} from './query-context';
export { getByIdWithOrmQueryFallback } from './query-context';
export type {
  ExtractTablesWithRelations,
  ManyConfig,
  OneConfig,
  RelationsBuilder,
  RelationsBuilderColumnBase,
  RelationsBuilderColumnConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
} from './relations';
// M2: Relations Layer (v1)
export { defineRelations, defineRelationsPart } from './relations';
// RLS (Row-Level Security)
export type {
  RlsPolicyConfig,
  RlsPolicyToOption,
} from './rls/policies';
export { RlsPolicy, rlsPolicy } from './rls/policies';
export type { RlsRoleConfig } from './rls/roles';
export { RlsRole, rlsRole } from './rls/roles';
export type { RlsContext, RlsMode } from './rls/types';
export {
  type ScheduledDeleteArgs,
  scheduledDeleteFactory,
} from './scheduled-delete';
export {
  type ScheduledMutationBatchArgs,
  scheduledMutationBatchFactory,
} from './scheduled-mutation-batch';
export { defineSchema } from './schema';
export type { OrmSchemaPlugin } from './symbols';
// M1: Schema Foundation
export {
  Brand,
  Columns,
  OrmSchemaPluginTables,
  TableName,
} from './symbols';
export type { ConvexTable, TableConfig } from './table';
export {
  type ConvexDeletionBuilder,
  type ConvexDeletionConfig,
  convexTable,
  deletion,
  type OrmLifecycleChange,
  type OrmLifecycleOperation,
} from './table';
export type {
  OrmBeforeResult,
  OrmTableTriggers,
  OrmTriggerChange,
  OrmTriggerContext,
  OrmTriggers,
} from './triggers';
export { defineTriggers } from './triggers';
// M3: Query Builder Types
export type {
  AggregateConfig,
  AggregateFieldValue,
  AggregateResult,
  BuildQueryResult,
  BuildRelationResult,
  CountConfig,
  CountResult,
  DBQueryConfig,
  FilterOperators,
  GetColumnData,
  InferInsertModel,
  InferModelFromColumns,
  InferSelectModel,
  InsertValue,
  MutationExecuteConfig,
  MutationExecuteResult,
  MutationExecutionMode,
  MutationPaginateConfig,
  MutationPaginatedResult,
  MutationResult,
  MutationReturning,
  MutationRunMode,
  OrderByClause,
  OrderDirection,
  PaginatedResult,
  PredicateWhereIndexConfig,
  ReturningAll,
  ReturningResult,
  ReturningSelection,
  UpdateSet,
  VectorQueryConfig,
  VectorSearchProvider,
} from './types';
export { unsetToken } from './unset-token';
// M4: Where Clause Compiler
export type { WhereClauseResult } from './where-clause-compiler';
