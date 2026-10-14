/**
 * Database Context Integration
 *
 * Builds an ORM client from Convex `ctx.db`.
 *
 * Public surface area is intentionally narrow:
 * - ORM query builders via `db.query.*.findMany/findFirst`
 * - ORM mutations via `db.insert/update/delete(table)` builder APIs
 * - Raw system-table access via `db.system` only
 *
 * We do NOT expose raw Convex writes (patch/replace/insert/delete) on `db`
 * because they bypass ORM runtime checks (constraints, defaults, RLS).
 */

import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  SchedulableFunctionReference,
  Scheduler,
} from 'convex/server';
import type { OrmCapabilities } from './capabilities';
import { ConvexDeleteBuilder } from './delete';
import type { EdgeMetadata } from './extractRelationsConfig';
import { ConvexInsertBuilder } from './insert';
import { getOrmLifecycleInnerDb } from './lifecycle';
import {
  buildForeignKeyGraph,
  type ForeignKeyGraph,
  type OrmContextValue,
  resolveOrmRuntimeDefaults,
} from './mutation-utils';
import { RelationalQueryBuilder } from './query-builder';
import type { TablesRelationalConfig } from './relations';
import type { RlsContext } from './rls/types';
import {
  Brand,
  OrmContext,
  type OrmRuntimeOptions,
  OrmSchemaOptions,
} from './symbols';
import type { ConvexTable } from './table';
import { markOrmTransactionAnchor } from './transaction-cache';
import type { VectorSearchProvider } from './types';
import { ConvexUpdateBuilder } from './update';

/**
 * Database with query builder API
 *
 * @template TSchema - Schema configuration with tables and relations
 *
 * Following Drizzle's pattern: Validate schema BEFORE mapped type to prevent type widening.
 * The conditional check outside the mapped type prevents distributive conditional behavior
 * that causes TSchema[K] to widen to a union of all table types.
 *
 * Pattern from: drizzle-orm/src/pg-core/db.ts lines 50-54
 * Key insight: TSchema[K] must be captured at mapping time, not evaluated in conditionals later.
 */
export type DatabaseWithQuery<TSchema extends TablesRelationalConfig> =
  // Expose raw system access for _storage and _scheduled_functions only.
  // This is the escape hatch for system tables, not app tables.
  Pick<GenericDatabaseReader<any>, 'system'> & {
    withoutTriggers<TResult>(
      callback: (orm: DatabaseWithQuery<TSchema>) => Promise<TResult>
    ): Promise<TResult>;
    query: TSchema extends Record<string, never>
      ? { error: 'Schema is empty - did you forget to add tables?' }
      : {
          [K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
        };
  };

export type DatabaseWithMutations<TSchema extends TablesRelationalConfig> =
  DatabaseWithQuery<TSchema> & {
    withoutTriggers<TResult>(
      callback: (orm: DatabaseWithMutations<TSchema>) => Promise<TResult>
    ): Promise<TResult>;
    insert<TTable extends ConvexTable<any>>(
      table: TTable
    ): ConvexInsertBuilder<TTable>;
    update<TTable extends ConvexTable<any>>(
      table: TTable
    ): ConvexUpdateBuilder<TTable>;
    delete<TTable extends ConvexTable<any>>(
      table: TTable
    ): ConvexDeleteBuilder<TTable>;
  };

export type OrmReader<TSchema extends TablesRelationalConfig> =
  DatabaseWithQuery<TSchema> & { skipRules: DatabaseWithQuery<TSchema> };

export type OrmWriter<TSchema extends TablesRelationalConfig> =
  DatabaseWithMutations<TSchema> & {
    skipRules: DatabaseWithMutations<TSchema>;
  };

/**
 * `createDatabase` runs on every Convex query and mutation entry, but the
 * foreign-key graph and the per-table edge partition are pure functions of the
 * schema and edge metadata, both fixed for the process lifetime. Caching them
 * on the identity of those objects keeps the per-request work proportional to
 * the table count instead of `tables x edges`.
 *
 * Both caches are only sound because their inputs are module-level immutables:
 * nothing in the ORM mutates a schema or an edge list after construction.
 */
const foreignKeyGraphCache = new WeakMap<object, ForeignKeyGraph>();
const edgesBySourceTableCache = new WeakMap<
  object,
  Map<string, EdgeMetadata[]>
>();
const NO_EDGES: EdgeMetadata[] = [];

function getForeignKeyGraph(schema: TablesRelationalConfig): ForeignKeyGraph {
  const cached = foreignKeyGraphCache.get(schema);
  if (cached) {
    return cached;
  }
  // Only cached on success, so a dangling foreign key keeps throwing rather
  // than poisoning the entry.
  const graph = buildForeignKeyGraph(schema);
  foreignKeyGraphCache.set(schema, graph);
  return graph;
}

function getEdgesBySourceTable(
  edgeMetadata: EdgeMetadata[]
): Map<string, EdgeMetadata[]> {
  const cached = edgesBySourceTableCache.get(edgeMetadata);
  if (cached) {
    return cached;
  }
  const grouped = new Map<string, EdgeMetadata[]>();
  for (const edge of edgeMetadata) {
    const existing = grouped.get(edge.sourceTable);
    if (existing) {
      existing.push(edge);
    } else {
      grouped.set(edge.sourceTable, [edge]);
    }
  }
  edgesBySourceTableCache.set(edgeMetadata, grouped);
  return grouped;
}

export type CreateDatabaseOptions = {
  /** Optional subsystems registered at `createOrm()`. See `./capabilities`. */
  capabilities?: OrmCapabilities;
  scheduler?: Scheduler;
  scheduledDelete?: SchedulableFunctionReference;
  scheduledMutationBatch?: SchedulableFunctionReference;
  vectorSearch?: VectorSearchProvider;
  rls?: RlsContext;
  relationLoading?: {
    concurrency?: number;
  };
};

/**
 * Create database context with query builder API
 *
 * @param db - Convex GenericDatabaseReader<any> (ctx.db)
 * @param schema - Schema configuration object (defineRelations output)
 * @param edgeMetadata - Edge metadata from extractRelationsConfig()
 * @returns Extended database with query property
 *
 * @example
 * import { createDatabase, extractRelationsConfig } from 'kitcn/orm';
 *
 * const schema = { users, posts };
 * const relations = defineRelations(schema, (r) => ({
 *   posts: {
 *     author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
 *   },
 * }));
 * const edges = extractRelationsConfig(relations);
 *
 * export default query({
 *   handler: async (ctx) => {
 *     const db = createDatabase(ctx.db, relations, edges);
 *     const users = await db.query.users.findMany({
 *       with: { posts: true }
 *     });
 *   }
 * });
 */
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseWriter<any>,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[],
  options?: CreateDatabaseOptions
): OrmWriter<TSchema>;
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseReader<any>,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[],
  options?: CreateDatabaseOptions
): OrmReader<TSchema>;
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseReader<any>,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[],
  options?: CreateDatabaseOptions
): OrmReader<TSchema> {
  const schemaOptions = (schema as { [OrmSchemaOptions]?: OrmRuntimeOptions })[
    OrmSchemaOptions
  ];
  const strict = schemaOptions?.strict ?? true;
  const defaults = schemaOptions?.defaults;
  const buildDatabase = (rls: RlsContext | undefined) => {
    const resolvedDefaults = resolveOrmRuntimeDefaults(defaults, {
      scheduler: options?.scheduler,
      scheduledMutationBatch: options?.scheduledMutationBatch,
    });
    const ormContext: OrmContextValue = {
      capabilities: options?.capabilities,
      foreignKeyGraph: getForeignKeyGraph(schema),
      schema,
      edgeMetadata,
      relationLoading: options?.relationLoading,
      scheduler: options?.scheduler,
      scheduledDelete: options?.scheduledDelete,
      scheduledMutationBatch: options?.scheduledMutationBatch,
      rls,
      strict,
      defaults,
      resolvedDefaults,
    };

    // Preserve the original `ctx.db` behavior without mutating it.
    // We only need to attach internal ORM runtime context via a symbol.
    // The anchor is pinned rather than inherited because `withoutTriggers`
    // builds this over the raw `ctx.db`, which carries nothing to resolve
    // through — see `markOrmTransactionAnchor`.
    const baseDb = markOrmTransactionAnchor(
      Object.assign(Object.create(db), {
        [OrmContext]: ormContext,
      }),
      db
    ) as unknown as GenericDatabaseWriter<any>;

    const query: any = {};
    const edgesBySourceTable = getEdgesBySourceTable(edgeMetadata);

    // Create query builder for each table in schema
    for (const [tableName, tableConfig] of Object.entries(schema)) {
      // Edges originating from this table, partitioned once per edge list.
      const tableEdges = edgesBySourceTable.get(tableConfig.name) ?? NO_EDGES;

      query[tableName] = new RelationalQueryBuilder(
        schema,
        tableConfig,
        tableEdges,
        baseDb,
        edgeMetadata, // M6.5 Phase 2: Pass all edges for nested relation loading
        rls,
        options?.relationLoading,
        options?.vectorSearch
      );
    }

    const isWriter =
      typeof (db as any).insert === 'function' &&
      typeof (db as any).patch === 'function';

    const isConvexTable = (value: unknown): value is ConvexTable<any> =>
      !!value &&
      typeof value === 'object' &&
      (value as any)[Brand] === 'ConvexTable';

    const insert = <TTable extends ConvexTable<any>>(table: TTable) => {
      if (!isWriter) {
        throw new Error(
          'db.insert() is not available on a reader context (use it in mutations).'
        );
      }
      if (!isConvexTable(table)) {
        throw new Error(
          'db.insert(table) requires a ConvexTable from convexTable(...).'
        );
      }
      return new ConvexInsertBuilder(baseDb, table);
    };

    const update = <TTable extends ConvexTable<any>>(table: TTable) => {
      if (!isWriter) {
        throw new Error(
          'db.update() is not available on a reader context (use it in mutations).'
        );
      }
      if (!isConvexTable(table)) {
        throw new Error(
          'db.update(table) requires a ConvexTable from convexTable(...).'
        );
      }
      return new ConvexUpdateBuilder(baseDb, table);
    };

    const deleteBuilder = <TTable extends ConvexTable<any>>(table: TTable) => {
      if (!isWriter) {
        throw new Error(
          'db.delete() is not available on a reader context (use it in mutations).'
        );
      }
      if (!isConvexTable(table)) {
        throw new Error(
          'db.delete(table) requires a ConvexTable from convexTable(...).'
        );
      }
      return new ConvexDeleteBuilder(baseDb, table);
    };

    let currentDb:
      | DatabaseWithQuery<TSchema>
      | DatabaseWithMutations<TSchema>
      | undefined;
    let withoutTriggersDb:
      | DatabaseWithQuery<TSchema>
      | DatabaseWithMutations<TSchema>
      | undefined;

    const runWithoutTriggers = async <TResult>(
      callback: (
        orm: DatabaseWithQuery<TSchema> | DatabaseWithMutations<TSchema>
      ) => Promise<TResult>
    ): Promise<TResult> => {
      const innerDb = getOrmLifecycleInnerDb(db);
      if (!innerDb) {
        return callback(currentDb as any);
      }

      withoutTriggersDb ??= createDatabase(innerDb, schema, edgeMetadata, {
        ...options,
        rls,
      }) as any;
      return callback(withoutTriggersDb as any);
    };

    const base = {
      // Internal runtime config for mutation builders, scheduling, and FK actions.
      [OrmContext]: ormContext,
      // System tables escape hatch (raw Convex API).
      system: (db as GenericDatabaseReader<any>).system,
      withoutTriggers: runWithoutTriggers,
      query,
    } as DatabaseWithQuery<TSchema>;

    const built = isWriter
      ? ({
          ...base,
          insert,
          update,
          delete: deleteBuilder,
        } as DatabaseWithMutations<TSchema>)
      : base;

    currentDb = built;
    return built;
  };

  const table = buildDatabase(options?.rls);

  // `skipRules` is an escape hatch almost no request touches, and building it
  // costs a second full query-builder graph. Build it on first access instead,
  // memoized for the life of this ORM (i.e. this request), the same shape
  // `withoutTriggers` already uses.
  let skipRulesTable: ReturnType<typeof buildDatabase> | undefined;

  return Object.defineProperty({ ...table }, 'skipRules', {
    enumerable: true,
    configurable: true,
    get() {
      skipRulesTable ??= buildDatabase({
        ...(options?.rls ?? {}),
        mode: 'skip',
      });
      return skipRulesTable;
    },
  }) as OrmReader<TSchema>;
}
