/**
 * Symbol-based metadata storage for ORM tables
 * Following Drizzle's pattern for type-safe runtime introspection
 */

export type OrmRuntimeDefaults = {
  defaultLimit?: number;
  relationFanOutMaxKeys?: number;
  mutationBatchSize?: number;
  mutationLeafBatchSize?: number;
  mutationMaxRows?: number;
  mutationMaxBytesPerBatch?: number;
  mutationScheduleCallCap?: number;
  mutationExecutionMode?: 'sync' | 'async';
  mutationAsyncDelayMs?: number;
};

export type OrmDeleteMode = 'hard' | 'soft' | 'scheduled';

export type OrmTableDeleteConfig = {
  mode: OrmDeleteMode;
  delayMs?: number;
};

export type OrmRuntimeOptions = {
  strict?: boolean;
  defaults?: OrmRuntimeDefaults;
};

export const TableName = Symbol.for('better-convex:TableName');
export const Columns = Symbol.for('better-convex:Columns');
export const Brand = Symbol.for('better-convex:Brand');
export const Relations = Symbol.for('better-convex:Relations');
export const OrmContext = Symbol.for('better-convex:OrmContext');
export const RlsPolicies = Symbol.for('better-convex:RlsPolicies');
export const EnableRLS = Symbol.for('better-convex:EnableRLS');
export const TableDeleteConfig = Symbol.for('better-convex:TableDeleteConfig');
export const OrmSchemaOptions = Symbol.for('better-convex:OrmSchemaOptions');
export const OrmSchemaDefinition = Symbol.for(
  'better-convex:OrmSchemaDefinition'
);
