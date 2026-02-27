import type {
  DefineSchemaOptions,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import { defineSchema as defineConvexSchema } from 'convex/server';
import { injectAggregateStorageTables } from './aggregate-index/schema';
import { injectMigrationStorageTables } from './migrations/schema';
import type { OrmRuntimeDefaults } from './symbols';
import { OrmSchemaDefinition, OrmSchemaOptions } from './symbols';

type BetterConvexSchemaOptions<StrictTableNameTypes extends boolean> =
  DefineSchemaOptions<StrictTableNameTypes> & {
    strict?: boolean;
    defaults?: OrmRuntimeDefaults;
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
>(
  schema: TSchema,
  options?: BetterConvexSchemaOptions<StrictTableNameTypes>
): SchemaDefinition<TSchema, StrictTableNameTypes> {
  const strict = options?.strict ?? true;
  const defaults = normalizeDefaults(options?.defaults);
  const schemaWithAggregateInternals = injectAggregateStorageTables(
    schema as unknown as Record<string, unknown>
  );
  const schemaWithInternals = injectMigrationStorageTables(
    schemaWithAggregateInternals
  ) as TSchema;

  Object.defineProperty(schema, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(schemaWithInternals, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });

  const {
    strict: _strict,
    defaults: _defaults,
    ...convexOptions
  } = options ?? {};
  const convexSchema = defineConvexSchema(
    schemaWithInternals as any,
    convexOptions as DefineSchemaOptions<StrictTableNameTypes>
  );
  Object.defineProperty(convexSchema as object, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(schema, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  Object.defineProperty(schemaWithInternals, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  Object.defineProperty(convexSchema as object, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  return convexSchema;
}
