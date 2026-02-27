import type {
  DefineSchemaOptions,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import { defineSchema as defineConvexSchema } from 'convex/server';
import { aggregatePlugin } from './aggregate-index/schema';
import { migrationPlugin } from './migrations/schema';
import type { OrmRuntimeDefaults, OrmSchemaPlugin } from './symbols';
import {
  OrmSchemaDefinition,
  OrmSchemaOptions,
  OrmSchemaPluginTables,
} from './symbols';

type BetterConvexSchemaOptions<StrictTableNameTypes extends boolean> =
  DefineSchemaOptions<StrictTableNameTypes> & {
    strict?: boolean;
    defaults?: OrmRuntimeDefaults;
    plugins?: readonly OrmSchemaPlugin[];
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
const BUILTIN_SCHEMA_PLUGINS = [aggregatePlugin(), migrationPlugin()] as const;

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

function resolveSchemaPlugins(
  plugins: readonly OrmSchemaPlugin[] | undefined
): readonly OrmSchemaPlugin[] {
  const resolved = [...BUILTIN_SCHEMA_PLUGINS, ...(plugins ?? [])];
  const seen = new Set<string>();

  for (const plugin of resolved) {
    if (seen.has(plugin.key)) {
      throw new Error(
        `defineSchema received duplicate plugin '${plugin.key}'. Remove duplicate plugin registrations.`
      );
    }
    seen.add(plugin.key);
  }

  return resolved;
}

function applySchemaPlugins<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  plugins: readonly OrmSchemaPlugin[]
): { schema: TSchema; pluginTableNames: readonly string[] } {
  let current = schema as unknown as Record<string, unknown>;
  const pluginTableNames: string[] = [];

  for (const plugin of plugins) {
    current = plugin.inject(current);
    for (const tableName of plugin.tableNames) {
      if (!pluginTableNames.includes(tableName)) {
        pluginTableNames.push(tableName);
      }
    }
  }

  return {
    schema: current as TSchema,
    pluginTableNames,
  };
}

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
  const plugins = resolveSchemaPlugins(options?.plugins);
  const { schema: schemaWithPlugins, pluginTableNames } = applySchemaPlugins(
    schema as unknown as Record<string, unknown>,
    plugins
  );
  const frozenPluginTableNames = Object.freeze([...pluginTableNames]);

  Object.defineProperty(schema, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(schemaWithPlugins, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(schema, OrmSchemaPluginTables, {
    value: frozenPluginTableNames,
    enumerable: false,
  });
  Object.defineProperty(schemaWithPlugins, OrmSchemaPluginTables, {
    value: frozenPluginTableNames,
    enumerable: false,
  });

  const {
    strict: _strict,
    defaults: _defaults,
    plugins: _plugins,
    ...convexOptions
  } = options ?? {};
  const convexSchema = defineConvexSchema(
    schemaWithPlugins as any,
    convexOptions as DefineSchemaOptions<StrictTableNameTypes>
  );
  Object.defineProperty(convexSchema as object, OrmSchemaOptions, {
    value: { strict, defaults },
    enumerable: false,
  });
  Object.defineProperty(convexSchema as object, OrmSchemaPluginTables, {
    value: frozenPluginTableNames,
    enumerable: false,
  });
  Object.defineProperty(schema, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  Object.defineProperty(schemaWithPlugins, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  Object.defineProperty(convexSchema as object, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  return convexSchema;
}
