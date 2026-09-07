import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from 'convex/server';
import {
  getAggregateIndexDefinitions,
  getRankIndexDefinitions,
} from './aggregate-index/definitions';
import type { OrmCapabilities } from './capabilities';
import { requireAggregateCapability } from './capabilities';
import type { TablesRelationalConfig } from './relations';
import {
  type NormalizedOrmTableTriggers,
  normalizeOrmTriggers,
  type OrmBeforeResult,
  type OrmTriggerChange,
  type OrmTriggers,
  TriggerCancelledError,
} from './triggers';
import { markLifecycleHookedTables } from './write-fanout';

const ORMLIFECYCLE_WRAPPED_DB = Symbol.for('kitcn:OrmLifecycleWrappedDB');
const ORMLIFECYCLE_INNER_DB = Symbol.for('kitcn:OrmLifecycleInnerDB');

type AnyRecord = Record<string, unknown>;
type AnyCtx = {
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>;
} & AnyRecord;
type AnyMutationCtx = {
  db: GenericDatabaseWriter<any>;
} & AnyRecord;
/**
 * A write barrier is a precondition, not a trigger: it reads `aggregate_state`
 * and either returns or throws, and it never touches the row being written.
 * Injecting it into a user `before` slot would overload that slot to mean both
 * "a hook may have rewritten this row" and "this table has an aggregate index",
 * which is exactly what forced `patch` to re-read a pre-image it already held.
 * Its own slot keeps `update.before` meaning only the former.
 */
type WriteBarrier = (db: GenericDatabaseReader<any>) => Promise<void>;

type LifecycleTableHooks = NormalizedOrmTableTriggers<AnyRecord> & {
  writeBarrier?: WriteBarrier;
};
type HookMap = Map<string, LifecycleTableHooks>;
type HookOperation = 'create' | 'update' | 'delete';
type QueuedHook = () => Promise<void>;

type HookExecutionResult<R> = {
  result: R;
  queuedHooks: QueuedHook[];
};

const isWriterDb = (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>
): db is GenericDatabaseWriter<any> =>
  typeof (db as any).insert === 'function' &&
  typeof (db as any).patch === 'function' &&
  typeof (db as any).delete === 'function';

const isLifecycleWrappedDb = (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>
): boolean => (db as any)[ORMLIFECYCLE_WRAPPED_DB] === true;

const markLifecycleWrappedDb = <TDb extends GenericDatabaseWriter<any>>(
  db: TDb
): TDb => {
  if (!Object.hasOwn(db as object, ORMLIFECYCLE_WRAPPED_DB)) {
    Object.defineProperty(db, ORMLIFECYCLE_WRAPPED_DB, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
  }
  return db;
};

export const getOrmLifecycleInnerDb = (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>
): GenericDatabaseWriter<any> | undefined => {
  const inner = (db as any)[ORMLIFECYCLE_INNER_DB];
  if (!inner || !isWriterDb(inner)) {
    return undefined;
  }
  return inner;
};

const isBeforeDataResult = (
  value: OrmBeforeResult<AnyRecord>
): value is { data: Partial<AnyRecord> } =>
  typeof value === 'object' && value !== null && 'data' in value;

/**
 * FIFO mutex. A re-checking spin over one shared promise wakes every waiter on
 * each release, which costs n(n-1)/2 resumptions for n contenders; handing the
 * lock to exactly one queued waiter costs n-1.
 */
class Lock {
  private locked = false;
  private readonly waiters: (() => void)[] = [];

  async withLock<R>(fn: () => Promise<R>): Promise<R> {
    const unlock = await this.acquire();
    try {
      return await fn();
    } finally {
      unlock();
    }
  }

  private async acquire(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    this.locked = true;

    // Single-shot: a second call would pop another waiter and let two holders
    // run at once, breaking the change-computation invariant this lock exists
    // to protect.
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const next = this.waiters.shift();
      if (next) {
        // Direct handoff: stay locked so no barging waiter can jump the queue.
        next();
        return;
      }
      this.locked = false;
    };
  }
}

const innerWriteLock = new Lock();
const outerWriteLock = new Lock();
const hookQueue: QueuedHook[] = [];
let activeHookDepth = 0;

const createHookCtx = (
  ctx: AnyMutationCtx,
  innerDb: GenericDatabaseWriter<any>,
  hooksByTable: HookMap
): AnyRecord => ({
  ...ctx,
  db: writerWithHooks(ctx, innerDb, hooksByTable, true),
  innerDb,
});

const mergeBeforeData = async (
  tableName: string,
  operation: HookOperation,
  beforeHook:
    | ((
        data: AnyRecord,
        ctx: AnyRecord
      ) => Promise<OrmBeforeResult<AnyRecord>> | OrmBeforeResult<AnyRecord>)
    | undefined,
  data: AnyRecord,
  hookCtx: AnyRecord
): Promise<AnyRecord> => {
  if (!beforeHook) {
    return data;
  }

  const result = await beforeHook(data, hookCtx);
  if (result === false) {
    throw new TriggerCancelledError(tableName, operation);
  }
  if (isBeforeDataResult(result)) {
    return {
      ...data,
      ...(result.data as AnyRecord),
    };
  }
  return data;
};

const withPublicIdAlias = (doc: AnyRecord, id: string): AnyRecord =>
  doc.id !== undefined
    ? doc
    : {
        ...doc,
        id,
      };

const isPlainRecord = (value: unknown): value is AnyRecord => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Convex value serialization drops `undefined` at any depth below the top
 * level, so a document read back from storage never carries a nested
 * `undefined` key. Mirror that when deriving a document locally, otherwise
 * `Object.keys(newDoc)` diverges from what a hook would observe.
 */
const stripUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const stripped = stripUndefinedDeep(entry);
      if (stripped !== entry) {
        changed = true;
      }
      return stripped;
    });
    return changed ? next : value;
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  let changed = false;
  const next: AnyRecord = {};
  for (const key of Object.keys(value)) {
    const nested = value[key];
    if (nested === undefined) {
      changed = true;
      continue;
    }
    const stripped = stripUndefinedDeep(nested);
    if (stripped !== nested) {
      changed = true;
    }
    next[key] = stripped;
  }
  return changed ? next : value;
};

/**
 * Reproduce Convex `1.0/shallowMerge`: a top-level shallow merge where a
 * top-level `undefined` removes the key. The stored document is fully
 * determined by the document we already read plus the payload we are about to
 * write, so re-reading it after the patch buys nothing.
 */
const applyPatchLocally = (
  oldDoc: AnyRecord,
  payload: AnyRecord
): AnyRecord => {
  const payloadKeys = Object.keys(payload);
  const removed = new Set<string>();
  for (const key of payloadKeys) {
    if (payload[key] === undefined) {
      removed.add(key);
    }
  }

  const newDoc: AnyRecord = {};
  for (const key of Object.keys(oldDoc)) {
    if (removed.has(key)) {
      continue;
    }
    newDoc[key] = oldDoc[key];
  }
  for (const key of payloadKeys) {
    if (removed.has(key)) {
      continue;
    }
    newDoc[key] = stripUndefinedDeep(payload[key]);
  }
  return newDoc;
};

/** Convex owns these; a replace payload can never carry them forward. */
const applyReplaceLocally = (
  oldDoc: AnyRecord,
  payload: AnyRecord
): AnyRecord => ({
  ...(stripUndefinedDeep(payload) as AnyRecord),
  _id: oldDoc._id,
  _creationTime: oldDoc._creationTime,
});

const tableNameFromId = (
  db: GenericDatabaseReader<any>,
  hooksByTable: HookMap,
  id: string
): string | null => {
  for (const tableName of hooksByTable.keys()) {
    if (db.normalizeId(tableName as any, id as any)) {
      return tableName;
    }
  }
  return null;
};

const queueOperationHooks = async <R>(
  ctx: AnyMutationCtx,
  innerDb: GenericDatabaseWriter<any>,
  hooksByTable: HookMap,
  execute: (hookCtx: AnyRecord) => Promise<HookExecutionResult<R>>
): Promise<R> =>
  innerWriteLock.withLock(async () => {
    const hookCtx = createHookCtx(ctx, innerDb, hooksByTable);
    const { result, queuedHooks } = await execute(hookCtx);
    for (const hook of queuedHooks) {
      hookQueue.push(hook);
    }
    return result;
  });

const executeThenDrainHooks = async <R>(
  ctx: AnyMutationCtx,
  innerDb: GenericDatabaseWriter<any>,
  hooksByTable: HookMap,
  isWithinHook: boolean,
  execute: (hookCtx: AnyRecord) => Promise<HookExecutionResult<R>>
): Promise<R> => {
  if (isWithinHook || activeHookDepth > 0) {
    return queueOperationHooks(ctx, innerDb, hooksByTable, execute);
  }

  return outerWriteLock.withLock(async () => {
    const result = await queueOperationHooks(
      ctx,
      innerDb,
      hooksByTable,
      execute
    );
    let firstError: unknown | null = null;

    while (hookQueue.length > 0) {
      const hook = hookQueue.shift();
      if (!hook) {
        continue;
      }
      try {
        activeHookDepth += 1;
        await hook();
      } catch (error) {
        if (firstError === null) {
          firstError = error;
        } else {
          console.error(error);
        }
      } finally {
        activeHookDepth = Math.max(0, activeHookDepth - 1);
      }
    }

    if (firstError !== null) {
      throw firstError;
    }
    return result;
  });
};

function writerWithHooks(
  ctx: AnyMutationCtx,
  innerDb: GenericDatabaseWriter<any>,
  hooksByTable: HookMap,
  isWithinHook = false
): GenericDatabaseWriter<any> {
  const patch: {
    (table: string, id: string, value: AnyRecord): Promise<void>;
    (id: string, value: AnyRecord): Promise<void>;
  } = async (arg0: string, arg1: string | AnyRecord, arg2?: AnyRecord) => {
    const [tableName, id, value] =
      arg2 !== undefined
        ? [arg0, arg1 as string, arg2]
        : [
            tableNameFromId(innerDb, hooksByTable, arg0),
            arg0,
            arg1 as AnyRecord,
          ];

    if (!tableName) {
      return innerDb.patch(id as any, value as any);
    }

    const tableHooks = hooksByTable.get(tableName);
    if (!tableHooks) {
      return innerDb.patch(tableName as any, id as any, value as any);
    }

    return executeThenDrainHooks(
      ctx,
      innerDb,
      hooksByTable,
      isWithinHook,
      async (hookCtx) => {
        // Fail closed before spending a read: a blocked write pays nothing.
        await tableHooks.writeBarrier?.(innerDb);
        // Only `update.after` and `change` consume the documents; a table
        // hooked solely for another operation must not pay a read here.
        const needsDocuments = Boolean(
          tableHooks.update?.after || tableHooks.change
        );
        const oldDoc = needsDocuments
          ? await innerDb.get(tableName as any, id as any)
          : null;
        const updatePayload = await mergeBeforeData(
          tableName,
          'update',
          tableHooks.update?.before,
          value,
          hookCtx
        );
        // A user before hook can write this document through `innerDb`, so
        // `newDoc` has to be derived from a fresh read in that case. `oldDoc`
        // deliberately keeps the statement-entry image: `change` consumers
        // reconstruct state from a contiguous oldDoc/newDoc chain, and a raw
        // `innerDb` write emits no change event of its own.
        const currentDoc =
          needsDocuments && tableHooks.update?.before
            ? await innerDb.get(tableName as any, id as any)
            : oldDoc;

        await innerDb.patch(tableName as any, id as any, updatePayload as any);

        if (!oldDoc) {
          return { result: undefined, queuedHooks: [] };
        }

        const newDoc = applyPatchLocally(
          (currentDoc ?? oldDoc) as AnyRecord,
          updatePayload as AnyRecord
        );
        const oldDocWithId = withPublicIdAlias(oldDoc as AnyRecord, id as any);
        const newDocWithId = withPublicIdAlias(newDoc, id as any);

        const change: OrmTriggerChange<AnyRecord> = {
          operation: 'update',
          id: id as any,
          oldDoc: oldDocWithId,
          newDoc: newDocWithId,
        };

        const queuedHooks: QueuedHook[] = [];
        if (tableHooks.update?.after) {
          queuedHooks.push(async () => {
            await tableHooks.update?.after?.(newDocWithId, hookCtx);
          });
        }
        if (tableHooks.change) {
          queuedHooks.push(async () => {
            await tableHooks.change?.(change, hookCtx);
          });
        }

        return {
          result: undefined,
          queuedHooks,
        };
      }
    );
  };

  const replace: {
    (table: string, id: string, value: AnyRecord): Promise<void>;
    (id: string, value: AnyRecord): Promise<void>;
  } = async (arg0: string, arg1: string | AnyRecord, arg2?: AnyRecord) => {
    const [tableName, id, value] =
      arg2 !== undefined
        ? [arg0, arg1 as string, arg2]
        : [
            tableNameFromId(innerDb, hooksByTable, arg0),
            arg0,
            arg1 as AnyRecord,
          ];

    if (!tableName) {
      return innerDb.replace(id as any, value as any);
    }

    const tableHooks = hooksByTable.get(tableName);
    if (!tableHooks) {
      return innerDb.replace(tableName as any, id as any, value as any);
    }

    return executeThenDrainHooks(
      ctx,
      innerDb,
      hooksByTable,
      isWithinHook,
      async (hookCtx) => {
        await tableHooks.writeBarrier?.(innerDb);
        const needsDocuments = Boolean(
          tableHooks.update?.after || tableHooks.change
        );
        const oldDoc = needsDocuments
          ? await innerDb.get(tableName as any, id as any)
          : null;
        const updatePayload = await mergeBeforeData(
          tableName,
          'update',
          tableHooks.update?.before,
          value,
          hookCtx
        );

        await innerDb.replace(
          tableName as any,
          id as any,
          updatePayload as any
        );

        if (!oldDoc) {
          return { result: undefined, queuedHooks: [] };
        }

        const newDoc = applyReplaceLocally(
          oldDoc as AnyRecord,
          updatePayload as AnyRecord
        );
        const oldDocWithId = withPublicIdAlias(oldDoc as AnyRecord, id as any);
        const newDocWithId = withPublicIdAlias(newDoc, id as any);

        const change: OrmTriggerChange<AnyRecord> = {
          operation: 'update',
          id: id as any,
          oldDoc: oldDocWithId,
          newDoc: newDocWithId,
        };

        const queuedHooks: QueuedHook[] = [];
        if (tableHooks.update?.after) {
          queuedHooks.push(async () => {
            await tableHooks.update?.after?.(newDocWithId, hookCtx);
          });
        }
        if (tableHooks.change) {
          queuedHooks.push(async () => {
            await tableHooks.change?.(change, hookCtx);
          });
        }

        return {
          result: undefined,
          queuedHooks,
        };
      }
    );
  };

  const delete_: (table: string, id?: string) => Promise<void> = async (
    arg0: string,
    arg1?: string
  ) => {
    const [tableName, id] =
      arg1 !== undefined
        ? [arg0, arg1]
        : [tableNameFromId(innerDb, hooksByTable, arg0), arg0];

    if (!tableName) {
      return innerDb.delete(id as any);
    }

    const tableHooks = hooksByTable.get(tableName);
    if (!tableHooks) {
      return innerDb.delete(tableName as any, id as any);
    }

    return executeThenDrainHooks(
      ctx,
      innerDb,
      hooksByTable,
      isWithinHook,
      async (hookCtx) => {
        // Ahead of the `!oldDoc` bail below, so a deleted-row delete on a
        // CLEARING table fails closed like every other write instead of
        // slipping past the barrier.
        await tableHooks.writeBarrier?.(innerDb);
        // `delete.before`, `delete.after` and `change` are the only consumers
        // of the pre-image; without one of them the read is pure waste.
        const needsDocuments = Boolean(tableHooks.delete || tableHooks.change);
        const oldDoc = needsDocuments
          ? await innerDb.get(tableName as any, id as any)
          : null;
        if (!oldDoc) {
          await innerDb.delete(tableName as any, id as any);
          return { result: undefined, queuedHooks: [] };
        }
        const oldDocWithId = withPublicIdAlias(oldDoc as AnyRecord, id as any);

        await mergeBeforeData(
          tableName,
          'delete',
          tableHooks.delete?.before,
          oldDocWithId,
          hookCtx
        );

        await innerDb.delete(tableName as any, id as any);

        const change: OrmTriggerChange<AnyRecord> = {
          operation: 'delete',
          id: id as any,
          oldDoc: oldDocWithId,
          newDoc: null,
        };

        const queuedHooks: QueuedHook[] = [];
        if (tableHooks.delete?.after) {
          queuedHooks.push(async () => {
            await tableHooks.delete?.after?.(oldDocWithId, hookCtx);
          });
        }
        if (tableHooks.change) {
          queuedHooks.push(async () => {
            await tableHooks.change?.(change, hookCtx);
          });
        }

        return {
          result: undefined,
          queuedHooks,
        };
      }
    );
  };

  const wrappedDb = {
    insert: async (table: string, value: AnyRecord): Promise<any> => {
      const tableHooks = hooksByTable.get(table);
      if (!tableHooks) {
        return innerDb.insert(table as any, value as any);
      }

      return executeThenDrainHooks(
        ctx,
        innerDb,
        hooksByTable,
        isWithinHook,
        async (hookCtx) => {
          await tableHooks.writeBarrier?.(innerDb);
          const insertPayload = await mergeBeforeData(
            table,
            'create',
            tableHooks.create?.before,
            value,
            hookCtx
          );
          const id = await innerDb.insert(table as any, insertPayload as any);
          // Convex `1.0/insert` returns only the id, so `_creationTime` cannot
          // be synthesized — but the read is only needed when someone consumes
          // the document.
          const needsDocument = Boolean(
            tableHooks.create?.after || tableHooks.change
          );
          const newDoc = needsDocument
            ? await innerDb.get(table as any, id)
            : null;

          if (!newDoc) {
            return { result: id, queuedHooks: [] };
          }
          const newDocWithId = withPublicIdAlias(
            newDoc as AnyRecord,
            id as any
          );

          const change: OrmTriggerChange<AnyRecord> = {
            operation: 'insert',
            id: id as any,
            oldDoc: null,
            newDoc: newDocWithId,
          };

          const queuedHooks: QueuedHook[] = [];
          if (tableHooks.create?.after) {
            queuedHooks.push(async () => {
              await tableHooks.create?.after?.(newDocWithId, hookCtx);
            });
          }
          if (tableHooks.change) {
            queuedHooks.push(async () => {
              await tableHooks.change?.(change, hookCtx);
            });
          }

          return { result: id, queuedHooks };
        }
      );
    },
    patch,
    replace,
    delete: delete_,
    vars: (
      innerDb as typeof innerDb & {
        vars: typeof innerDb extends { vars: infer Vars } ? Vars : never;
      }
    ).vars,
    system: innerDb.system,
    get: innerDb.get.bind(innerDb),
    query: innerDb.query.bind(innerDb),
    normalizeId: innerDb.normalizeId.bind(innerDb),
  };

  Object.defineProperty(wrappedDb, ORMLIFECYCLE_INNER_DB, {
    configurable: false,
    enumerable: false,
    value: innerDb,
    writable: false,
  });

  return wrappedDb;
}

export type OrmDbLifecycle = {
  enabled: boolean;
  wrapDB<Ctx extends AnyCtx>(ctx: Ctx): Ctx;
};

const createNoopLifecycle = (): OrmDbLifecycle => ({
  enabled: false,
  wrapDB: <Ctx extends AnyCtx>(ctx: Ctx): Ctx => ctx,
});

export function createOrmDbLifecycle<TSchema extends TablesRelationalConfig>(
  schema: TSchema,
  triggerDefinitions?: OrmTriggers<TSchema, any>,
  capabilities?: OrmCapabilities
): OrmDbLifecycle {
  const tableNameBySchemaKey = new Map<string, string>();
  const tableNames = new Set<string>();

  for (const [schemaKey, tableConfig] of Object.entries(schema)) {
    if (!tableConfig?.table) {
      continue;
    }
    const tableName =
      (tableConfig.table as any).tableName ??
      (tableConfig.table as any)?._?.name ??
      tableConfig.name;
    tableNameBySchemaKey.set(schemaKey, tableName);
    tableNames.add(tableName);
  }

  const tableHooks: HookMap = new Map<string, LifecycleTableHooks>();
  const normalizedTriggers = normalizeOrmTriggers(triggerDefinitions);

  for (const [triggerKey, hooks] of normalizedTriggers.entries()) {
    const tableName =
      tableNameBySchemaKey.get(triggerKey) ??
      (tableNames.has(triggerKey) ? triggerKey : undefined);

    if (!tableName) {
      throw new Error(
        `Unknown trigger table '${triggerKey}'. Export triggers with defineTriggers(relations, { ... }) using keys from your relations export.`
      );
    }

    tableHooks.set(tableName, hooks);
  }

  for (const tableConfig of Object.values(schema)) {
    if (!tableConfig?.table || !tableConfig?.name) {
      continue;
    }
    const aggregateIndexes = getAggregateIndexDefinitions(tableConfig);
    const rankIndexes = getRankIndexDefinitions(tableConfig);
    if (aggregateIndexes.length === 0 && rankIndexes.length === 0) {
      continue;
    }

    // Deliberately the relations key, matching `defineSchema`'s object key.
    // Every other aggregate site keys on it too — the backfill targets in
    // `aggregate-index/backfill.ts` and the `count()`/`rank()` read paths in
    // `aggregate-index/runtime.ts` and `rank-runtime.ts`. Resolving the table
    // object's own name here instead would make maintenance write buckets
    // under a key the backfill and every read never look at.
    const tableName = tableConfig.name;

    // Fail closed: writes to a table with aggregate/rank indexes must maintain
    // them, and the runtime that does so is only in the graph when the app
    // registers the capability.
    const aggregate = requireAggregateCapability(
      capabilities,
      `Table '${tableName}' declares an aggregateIndex/rankIndex, which`
    );

    const existing = tableHooks.get(tableName) ?? {};
    const existingChange = existing.change;
    const existingBarrier = existing.writeBarrier;
    const metricIndexNames = aggregateIndexes.map((entry) => entry.name);
    const rankIndexNames = rankIndexes.map((entry) => entry.name);

    tableHooks.set(tableName, {
      ...existing,
      writeBarrier: async (db) => {
        await existingBarrier?.(db);
        await aggregate.assertAggregateIndexesWritable(
          db as GenericDatabaseWriter<any>,
          tableName,
          metricIndexNames,
          rankIndexNames
        );
      },
      change: async (change, ctx) => {
        if (change.operation === 'delete') {
          if (aggregateIndexes.length > 0) {
            await aggregate.applyAggregateIndexesForChange(
              ctx.db as GenericDatabaseWriter<any>,
              tableName,
              aggregateIndexes,
              {
                operation: 'delete',
                id: change.id as any,
              }
            );
          }
          if (rankIndexes.length > 0) {
            await aggregate.applyRankIndexesForChange(
              ctx.db as GenericDatabaseWriter<any>,
              tableName,
              rankIndexes,
              {
                operation: 'delete',
                id: change.id as any,
              }
            );
          }
        } else {
          if (aggregateIndexes.length > 0) {
            await aggregate.applyAggregateIndexesForChange(
              ctx.db as GenericDatabaseWriter<any>,
              tableName,
              aggregateIndexes,
              {
                operation: change.operation,
                id: change.id as any,
                newDoc: change.newDoc as Record<string, unknown>,
              }
            );
          }
          if (rankIndexes.length > 0) {
            await aggregate.applyRankIndexesForChange(
              ctx.db as GenericDatabaseWriter<any>,
              tableName,
              rankIndexes,
              {
                operation: change.operation,
                id: change.id as any,
                newDoc: change.newDoc as Record<string, unknown>,
              }
            );
          }
        }

        await existingChange?.(change, ctx);
      },
    });
  }

  if (tableHooks.size === 0) {
    return createNoopLifecycle();
  }

  const hookedTableNames: ReadonlySet<string> = new Set(tableHooks.keys());

  return {
    enabled: true,
    wrapDB: <Ctx extends AnyCtx>(ctx: Ctx): Ctx => {
      if (!isWriterDb(ctx.db) || isLifecycleWrappedDb(ctx.db)) {
        return ctx;
      }

      const wrappedDb = writerWithHooks(
        ctx as unknown as AnyMutationCtx,
        ctx.db as GenericDatabaseWriter<any>,
        tableHooks,
        false
      );
      markLifecycleHookedTables(wrappedDb, hookedTableNames);

      return {
        ...ctx,
        db: markLifecycleWrappedDb(wrappedDb),
      } as Ctx;
    },
  };
}
