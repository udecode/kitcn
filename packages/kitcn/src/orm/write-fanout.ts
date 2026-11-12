/**
 * Lifecycle bookkeeping for the ORM write path.
 *
 * Deliberately dependency-free: `mutation-utils`, `lifecycle` and `query` all
 * import it, and Convex bundles every static import of a function entry. The
 * bounded fan-out primitive itself lives in `internal/concurrency` so the CLI
 * can share it without dragging this module in.
 */

const ORMLIFECYCLE_HOOKED_TABLES = Symbol.for('kitcn:OrmLifecycleHookedTables');

/** Matches the ORM's relation-loading default. */
export const DEFAULT_WRITE_FANOUT_CONCURRENCY = 25;

/**
 * Records which tables the lifecycle writer intercepts, so write fan-out can
 * see it without importing `lifecycle` (which would close an import cycle
 * through `aggregate-index/runtime`).
 */
export const markLifecycleHookedTables = <TDb extends object>(
  db: TDb,
  tableNames: { has(tableName: string): boolean }
): TDb => {
  Object.defineProperty(db, ORMLIFECYCLE_HOOKED_TABLES, {
    configurable: false,
    enumerable: false,
    value: tableNames,
    writable: false,
  });
  return db;
};

/**
 * True when writes to `tableName` run through trigger / aggregate-index hooks.
 * Those writes are serialized by the lifecycle write lock and their hooks fire
 * in write order, so they must keep their sequential loop; everything else is
 * free to fan out.
 */
export const hasLifecycleHooks = (db: unknown, tableName: string): boolean => {
  const tables = (db as Record<PropertyKey, unknown> | null | undefined)?.[
    ORMLIFECYCLE_HOOKED_TABLES
  ] as { has(tableName: string): boolean } | undefined;
  return tables?.has(tableName) ?? false;
};
