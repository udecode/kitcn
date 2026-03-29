import type { GenericDatabaseWriter } from 'convex/server';
import type { OrmWriter } from './database';
import type {
  TableRelationalConfig,
  TablesRelationalConfig,
} from './relations';
import type { OrmLifecycleChange } from './table';
import type { InferInsertModel, InferSelectModel } from './types';

type MaybePromise<T> = T | Promise<T>;
type AnyRecord = Record<string, unknown>;
type OperationHook = 'create' | 'update' | 'delete';
type TableTriggerKey = OperationHook | 'change';

type KnownKeys<T> = {
  [K in keyof T]-?: string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K;
}[keyof T];

type TriggerTableName<TSchema extends TablesRelationalConfig> = {
  [K in KnownKeys<TSchema>]-?: TSchema[K] extends TableRelationalConfig
    ? K extends string
      ? K
      : never
    : never;
}[KnownKeys<TSchema>];

type TriggerDoc<
  TSchema extends TablesRelationalConfig,
  TTableName extends TriggerTableName<TSchema>,
> = TSchema[TTableName] extends TableRelationalConfig
  ? InferSelectModel<TSchema[TTableName]['table']>
  : never;

type TriggerInsertData<
  TSchema extends TablesRelationalConfig,
  TTableName extends TriggerTableName<TSchema>,
> = TSchema[TTableName] extends TableRelationalConfig
  ? InferInsertModel<TSchema[TTableName]['table']>
  : never;

type TriggerUpdateData<
  TSchema extends TablesRelationalConfig,
  TTableName extends TriggerTableName<TSchema>,
> = Partial<TriggerInsertData<TSchema, TTableName>>;

export type OrmTriggerContext<
  TSchema extends TablesRelationalConfig,
  TExtraCtx extends object = {},
> = Omit<TExtraCtx, 'db' | 'innerDb' | 'orm'> & {
  db: GenericDatabaseWriter<any>;
  innerDb: GenericDatabaseWriter<any>;
  orm: OrmWriter<TSchema>;
};

type TriggerChangeId<TDoc> = TDoc extends { _id: infer TId }
  ? TId
  : TDoc extends { id: infer TId }
    ? TId
    : unknown;

export type OrmTriggerChange<
  TDoc = AnyRecord,
  TId = TriggerChangeId<TDoc>,
> = OrmLifecycleChange<TDoc, TId>;

export type OrmBeforeResult<TData extends AnyRecord> =
  // biome-ignore lint/suspicious/noConfusingVoidType: before hooks intentionally allow "return nothing" as a first-class outcome.
  | void
  | false
  | {
      data: Partial<TData>;
    };

type OrmBeforeHook<TData extends AnyRecord, TCtx extends object> = (
  data: TData,
  ctx: TCtx
) => MaybePromise<OrmBeforeResult<TData>>;

type OrmAfterHook<TDoc extends AnyRecord, TCtx extends object> = (
  doc: TDoc,
  ctx: TCtx
) => MaybePromise<void>;

type OrmChangeHook<TDoc extends AnyRecord, TCtx extends object> =
  | ((change: OrmTriggerChange<TDoc>, ctx: TCtx) => MaybePromise<void>)
  | {
      (): unknown;
      (change: OrmTriggerChange<TDoc>, ctx: TCtx): MaybePromise<void>;
    };

export type OrmTableTriggers<
  TDoc extends AnyRecord,
  TInsert extends AnyRecord,
  TUpdate extends AnyRecord,
  TCtx extends object,
> = {
  create?: {
    before?: OrmBeforeHook<TInsert, TCtx>;
    after?: OrmAfterHook<TDoc, TCtx>;
  };
  update?: {
    before?: OrmBeforeHook<TUpdate, TCtx>;
    after?: OrmAfterHook<TDoc, TCtx>;
  };
  delete?: {
    before?: OrmBeforeHook<TDoc, TCtx>;
    after?: OrmAfterHook<TDoc, TCtx>;
  };
  change?: OrmChangeHook<TDoc, TCtx>;
};

export type OrmTriggers<
  TSchema extends TablesRelationalConfig,
  TExtraCtx extends object = {},
> = {
  [TTableName in TriggerTableName<TSchema>]?: OrmTableTriggers<
    TriggerDoc<TSchema, TTableName>,
    TriggerInsertData<TSchema, TTableName>,
    TriggerUpdateData<TSchema, TTableName>,
    OrmTriggerContext<TSchema, TExtraCtx>
  >;
};

type RuntimeBeforeHook = (
  data: AnyRecord,
  ctx: AnyRecord
) => MaybePromise<OrmBeforeResult<AnyRecord>>;
type RuntimeAfterHook = (doc: AnyRecord, ctx: AnyRecord) => MaybePromise<void>;
type RuntimeChangeHook = (
  change: OrmTriggerChange<AnyRecord>,
  ctx: AnyRecord
) => MaybePromise<void>;

export type NormalizedOrmTableTriggers<
  TCtx extends Record<string, unknown> = AnyRecord,
> = {
  create?: {
    before?: (
      data: AnyRecord,
      ctx: TCtx
    ) => MaybePromise<OrmBeforeResult<AnyRecord>>;
    after?: (doc: AnyRecord, ctx: TCtx) => MaybePromise<void>;
  };
  update?: {
    before?: (
      data: AnyRecord,
      ctx: TCtx
    ) => MaybePromise<OrmBeforeResult<AnyRecord>>;
    after?: (doc: AnyRecord, ctx: TCtx) => MaybePromise<void>;
  };
  delete?: {
    before?: (
      doc: AnyRecord,
      ctx: TCtx
    ) => MaybePromise<OrmBeforeResult<AnyRecord>>;
    after?: (doc: AnyRecord, ctx: TCtx) => MaybePromise<void>;
  };
  change?: (
    change: OrmTriggerChange<AnyRecord>,
    ctx: TCtx
  ) => MaybePromise<void>;
};

const TABLE_TRIGGER_KEYS = new Set<TableTriggerKey>([
  'create',
  'update',
  'delete',
  'change',
]);

const assertRecord = (
  value: unknown,
  message: string
): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return true;
};

const isFunction = (value: unknown): value is (...args: any[]) => unknown =>
  typeof value === 'function';

const parseOperationHook = (
  tableName: string,
  key: OperationHook,
  value: unknown
): { before?: RuntimeBeforeHook; after?: RuntimeAfterHook } | undefined => {
  if (value === undefined) {
    return;
  }

  assertRecord(
    value,
    `Invalid '${key}' trigger for '${tableName}'. Expected an object with optional before/after handlers.`
  );

  const before = (value as { before?: unknown }).before;
  const after = (value as { after?: unknown }).after;

  if (before !== undefined && !isFunction(before)) {
    throw new Error(
      `Invalid '${key}.before' hook for '${tableName}'. Expected a function.`
    );
  }
  if (after !== undefined && !isFunction(after)) {
    throw new Error(
      `Invalid '${key}.after' hook for '${tableName}'. Expected a function.`
    );
  }

  if (before === undefined && after === undefined) {
    return;
  }

  return {
    before: before as RuntimeBeforeHook | undefined,
    after: after as RuntimeAfterHook | undefined,
  };
};

const hasAnyHooks = (hooks: NormalizedOrmTableTriggers): boolean =>
  !!hooks.create || !!hooks.update || !!hooks.delete || !!hooks.change;

export class TriggerCancelledError extends Error {
  readonly tableName: string;
  readonly operation: OperationHook;

  constructor(tableName: string, operation: OperationHook) {
    super(`Trigger cancelled ${operation} on '${tableName}'.`);
    this.name = 'TriggerCancelledError';
    this.tableName = tableName;
    this.operation = operation;
  }
}

export function defineTriggers<TSchema extends TablesRelationalConfig>(
  schema: TSchema,
  triggers: OrmTriggers<TSchema>
): OrmTriggers<TSchema>;
export function defineTriggers<
  TSchema extends TablesRelationalConfig,
  TExtraCtx extends object,
>(
  schema: TSchema,
  triggers: OrmTriggers<TSchema, TExtraCtx>
): OrmTriggers<TSchema, TExtraCtx>;
export function defineTriggers(
  schema: TablesRelationalConfig,
  triggers: OrmTriggers<TablesRelationalConfig, object>
) {
  void schema;
  return triggers;
}

export function normalizeOrmTriggers<
  TSchema extends TablesRelationalConfig,
  TExtraCtx extends object = object,
>(
  triggers: OrmTriggers<TSchema, TExtraCtx> | undefined
): Map<string, NormalizedOrmTableTriggers<Record<string, unknown>>> {
  const result = new Map<
    string,
    NormalizedOrmTableTriggers<Record<string, unknown>>
  >();
  if (!triggers) {
    return result;
  }

  for (const [tableName, tableHooks] of Object.entries(triggers)) {
    if (!tableHooks) {
      continue;
    }

    if (Array.isArray(tableHooks)) {
      throw new Error(
        `Invalid triggers entry for '${tableName}'. Array-based trigger definitions were removed. Use { create, update, delete, change } shape.`
      );
    }

    if (isFunction(tableHooks)) {
      throw new Error(
        `Invalid triggers entry for '${tableName}'. Function-style trigger callbacks were removed. Use { change: async (change, ctx) => ... } instead.`
      );
    }

    assertRecord(
      tableHooks,
      `Invalid triggers entry for '${tableName}'. Expected an object with create/update/delete/change keys.`
    );

    for (const key of Object.keys(tableHooks)) {
      if (!TABLE_TRIGGER_KEYS.has(key as TableTriggerKey)) {
        throw new Error(
          `Invalid trigger key '${key}' for '${tableName}'. Allowed keys: create, update, delete, change.`
        );
      }
    }

    const normalized: NormalizedOrmTableTriggers<Record<string, unknown>> = {
      create: parseOperationHook(
        tableName,
        'create',
        (tableHooks as { create?: unknown }).create
      ),
      update: parseOperationHook(
        tableName,
        'update',
        (tableHooks as { update?: unknown }).update
      ),
      delete: parseOperationHook(
        tableName,
        'delete',
        (tableHooks as { delete?: unknown }).delete
      ),
    };

    const change = (tableHooks as { change?: unknown }).change;
    if (change !== undefined && !isFunction(change)) {
      throw new Error(
        `Invalid 'change' hook for '${tableName}'. Expected a function with signature (change, ctx).`
      );
    }
    if (change !== undefined) {
      normalized.change = change as RuntimeChangeHook;
    }

    if (!hasAnyHooks(normalized)) {
      continue;
    }

    result.set(tableName, normalized);
  }

  return result;
}
