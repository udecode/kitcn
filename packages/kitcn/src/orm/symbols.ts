/**
 * Symbol-based metadata storage for ORM tables
 * Following Drizzle's pattern for type-safe runtime introspection
 */

export type OrmRuntimeDefaults = {
  defaultLimit?: number;
  countBackfillBatchSize?: number;
  relationFanOutMaxKeys?: number;
  aggregateCartesianMaxKeys?: number;
  aggregateWorkBudget?: number;
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

export type TablePolymorphicVariantRuntime = {
  fieldNames: readonly string[];
  requiredFieldNames: readonly string[];
};

export type TablePolymorphicConfigRuntime = {
  discriminator: string;
  alias: string;
  generatedFieldNames: readonly string[];
  variants: Readonly<Record<string, TablePolymorphicVariantRuntime>>;
};

export const TableName = Symbol.for('kitcn:TableName');
export const Columns = Symbol.for('kitcn:Columns');
export const Brand = Symbol.for('kitcn:Brand');
export const Relations = Symbol.for('kitcn:Relations');
export const OrmContext = Symbol.for('kitcn:OrmContext');
export const RlsPolicies = Symbol.for('kitcn:RlsPolicies');
export const EnableRLS = Symbol.for('kitcn:EnableRLS');
export const TableDeleteConfig = Symbol.for('kitcn:TableDeleteConfig');
export const TablePolymorphic = Symbol.for('kitcn:TablePolymorphic');
export const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');
export const OrmSchemaDefinition = Symbol.for('kitcn:OrmSchemaDefinition');
export const OrmSchemaExtensionTables = Symbol.for(
  'kitcn:OrmSchemaExtensionTables'
);
export const OrmSchemaExtensions = Symbol.for('kitcn:OrmSchemaExtensions');
export const OrmSchemaExtensionRelations = Symbol.for(
  'kitcn:OrmSchemaExtensionRelations'
);
export const OrmSchemaExtensionTriggers = Symbol.for(
  'kitcn:OrmSchemaExtensionTriggers'
);
export const OrmSchemaRelations = Symbol.for('kitcn:OrmSchemaRelations');
export const OrmSchemaTriggers = Symbol.for('kitcn:OrmSchemaTriggers');
