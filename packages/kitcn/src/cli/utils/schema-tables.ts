/**
 * Schema introspection shared by codegen and the backend flows.
 *
 * Both need the same answer to "does this app use aggregate/rank indexes?":
 * codegen registers `aggregateCapability()` on it, and the CLI skips the
 * backfill flows on it. Two implementations would drift into a state where the
 * generated ORM refuses a call the CLI still makes.
 */

import { getAggregateIndexes, getRankIndexes } from '../../orm/index-utils.js';
import { getSchemaRelations } from '../../orm/schema.js';
import { Brand } from '../../orm/symbols.js';

/** The `defineSchema(...)` value behind a loaded `schema.ts` module. */
export function resolveSchemaDefaultExport(
  schemaModule: Record<string, unknown>
): Record<string, unknown> | null {
  const schemaValue =
    schemaModule.default !== undefined ? schemaModule.default : schemaModule;
  if (!schemaValue || typeof schemaValue !== 'object') {
    return null;
  }
  return schemaValue as Record<string, unknown>;
}

/**
 * Every live table behind a schema value.
 *
 * `SchemaDefinition.tables` is the merged base + plugin-extension map, so auth,
 * ratelimit and the built-in aggregate/migration bookkeeping tables are all
 * covered. The relations config is unioned in because a `.relations()` chain
 * re-materializes the definition, and it is absent for schemas that declare
 * neither relations nor triggers.
 */
export function collectSchemaTables(
  schemaValue: Record<string, unknown>
): unknown[] {
  const allTables = new Set<unknown>();
  const relations = getSchemaRelations(schemaValue);
  if (relations && typeof relations === 'object' && !Array.isArray(relations)) {
    for (const relationConfig of Object.values(
      relations as Record<string, unknown>
    )) {
      const table = (relationConfig as { table?: unknown })?.table;
      if (table) {
        allTables.add(table);
      }
    }
  }

  const tables = schemaValue.tables;
  if (tables && typeof tables === 'object' && !Array.isArray(tables)) {
    for (const table of Object.values(tables as Record<string, unknown>)) {
      if (table) {
        allTables.add(table);
      }
    }
  }

  return [...allTables];
}

/**
 * Whether the schema needs the aggregate-index runtime.
 *
 * Reading a table's aggregate/rank indexes builds its definition, so the
 * answer is final once `schema.ts` has evaluated.
 * Duck-typed rather than routed through `getTableConfig`, which throws on a
 * raw Convex `defineTable()` in a mixed schema.
 */
export function schemaDeclaresAggregateIndexes(
  schemaValue: Record<string, unknown>
): boolean {
  return collectSchemaTables(schemaValue).some(
    (table) =>
      getAggregateIndexes(table as any).length > 0 ||
      getRankIndexes(table as any).length > 0
  );
}

/** Builds every kitcn table behind a schema value, throwing its definition error. */
export function validateOrmTables(schemaValue: Record<string, unknown>): void {
  for (const table of collectSchemaTables(schemaValue)) {
    if ((table as { [Brand]?: unknown })[Brand] === 'ConvexTable') {
      (table as { export(): unknown }).export();
    }
  }
}
