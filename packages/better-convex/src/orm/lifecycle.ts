import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from 'convex/server';
import type { TablesRelationalConfig } from './relations';
import {
  type NormalizedOrmTableTriggers,
  normalizeOrmTriggers,
  type OrmBeforeResult,
  type OrmTriggerChange,
  type OrmTriggers,
  TriggerCancelledError,
} from './triggers';

const ORMLIFECYCLE_WRAPPED_DB = Symbol.for(
  'better-convex:OrmLifecycleWrappedDB'
);

type AnyRecord = Record<string, unknown>;
type AnyCtx = {
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>;
} & AnyRecord;
type AnyMutationCtx = {
  db: GenericDatabaseWriter<any>;
} & AnyRecord;
type HookMap = Map<string, NormalizedOrmTableTriggers<AnyRecord>>;
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

const isBeforeDataResult = (
  value: OrmBeforeResult<AnyRecord>
): value is { data: Partial<AnyRecord> } =>
  typeof value === 'object' && value !== null && 'data' in value;

class Lock {
  promise: Promise<void> | null = null;
  resolve: (() => void) | null = null;

  async withLock<R>(fn: () => Promise<R>): Promise<R> {
    const unlock = await this.acquire();
    try {
      return await fn();
    } finally {
      unlock();
    }
  }

  private async acquire(): Promise<() => void> {
    while (this.promise !== null) {
      await this.promise;
    }

    let resolve!: () => void;
    this.promise = new Promise<void>((res) => {
      resolve = res;
    });
    this.resolve = resolve;

    return () => {
      this.promise = null;
      this.resolve?.();
    };
  }
}

const innerWriteLock = new Lock();
const outerWriteLock = new Lock();
const hookQueue: QueuedHook[] = [];

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
  if (isWithinHook) {
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
        await hook();
      } catch (error) {
        if (firstError === null) {
          firstError = error;
        } else {
          console.error(error);
        }
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
        const oldDoc = await innerDb.get(tableName as any, id as any);
        const updatePayload = await mergeBeforeData(
          tableName,
          'update',
          tableHooks.update?.before,
          value,
          hookCtx
        );

        await innerDb.patch(tableName as any, id as any, updatePayload as any);

        if (!oldDoc) {
          return { result: undefined, queuedHooks: [] };
        }

        const newDoc = await innerDb.get(tableName as any, id as any);
        if (!newDoc) {
          return { result: undefined, queuedHooks: [] };
        }

        const change: OrmTriggerChange<AnyRecord> = {
          operation: 'update',
          id: id as any,
          oldDoc: oldDoc as AnyRecord,
          newDoc: newDoc as AnyRecord,
        };

        const queuedHooks: QueuedHook[] = [];
        if (tableHooks.update?.after) {
          queuedHooks.push(async () => {
            await tableHooks.update?.after?.(newDoc as AnyRecord, hookCtx);
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
        const oldDoc = await innerDb.get(tableName as any, id as any);
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

        const newDoc = await innerDb.get(tableName as any, id as any);
        if (!newDoc) {
          return { result: undefined, queuedHooks: [] };
        }

        const change: OrmTriggerChange<AnyRecord> = {
          operation: 'update',
          id: id as any,
          oldDoc: oldDoc as AnyRecord,
          newDoc: newDoc as AnyRecord,
        };

        const queuedHooks: QueuedHook[] = [];
        if (tableHooks.update?.after) {
          queuedHooks.push(async () => {
            await tableHooks.update?.after?.(newDoc as AnyRecord, hookCtx);
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
        const oldDoc = await innerDb.get(tableName as any, id as any);
        if (!oldDoc) {
          await innerDb.delete(tableName as any, id as any);
          return { result: undefined, queuedHooks: [] };
        }

        await mergeBeforeData(
          tableName,
          'delete',
          tableHooks.delete?.before,
          oldDoc as AnyRecord,
          hookCtx
        );

        await innerDb.delete(tableName as any, id as any);

        const change: OrmTriggerChange<AnyRecord> = {
          operation: 'delete',
          id: id as any,
          oldDoc: oldDoc as AnyRecord,
          newDoc: null,
        };

        const queuedHooks: QueuedHook[] = [];
        if (tableHooks.delete?.after) {
          queuedHooks.push(async () => {
            await tableHooks.delete?.after?.(oldDoc as AnyRecord, hookCtx);
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

  return {
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
          const insertPayload = await mergeBeforeData(
            table,
            'create',
            tableHooks.create?.before,
            value,
            hookCtx
          );
          const id = await innerDb.insert(table as any, insertPayload as any);
          const newDoc = await innerDb.get(table as any, id);

          if (!newDoc) {
            return { result: id, queuedHooks: [] };
          }

          const change: OrmTriggerChange<AnyRecord> = {
            operation: 'insert',
            id: id as any,
            oldDoc: null,
            newDoc: newDoc as AnyRecord,
          };

          const queuedHooks: QueuedHook[] = [];
          if (tableHooks.create?.after) {
            queuedHooks.push(async () => {
              await tableHooks.create?.after?.(newDoc as AnyRecord, hookCtx);
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
    system: innerDb.system,
    get: innerDb.get.bind(innerDb),
    query: innerDb.query.bind(innerDb),
    normalizeId: innerDb.normalizeId.bind(innerDb),
  };
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
  triggerDefinitions?: OrmTriggers<TSchema, any>
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

  const tableHooks = new Map<string, NormalizedOrmTableTriggers<AnyRecord>>();
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

  if (tableHooks.size === 0) {
    return createNoopLifecycle();
  }

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

      return {
        ...ctx,
        db: markLifecycleWrappedDb(wrappedDb),
      } as Ctx;
    },
  };
}
