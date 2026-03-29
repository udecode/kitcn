import type { BetterAuthOptions } from 'better-auth/minimal';
import type {
  DocumentByName,
  GenericDataModel,
  GenericSchema,
  SchemaDefinition,
  TableNamesInDataModel,
} from 'convex/server';

type MaybePromise<T> = T | Promise<T>;

type TableDoc<DataModel extends GenericDataModel, TableName extends string> =
  TableName extends TableNamesInDataModel<DataModel>
    ? DocumentByName<DataModel, TableName> extends Record<string, unknown>
      ? DocumentByName<DataModel, TableName>
      : Record<string, unknown>
    : Record<string, unknown>;

type InsertDocData<TDoc extends Record<string, unknown>> = Omit<
  TDoc,
  '_id' | '_creationTime'
>;
type UpdateDocData<TDoc extends Record<string, unknown>> = Partial<
  Omit<TDoc, '_id' | '_creationTime'>
>;

type TriggerChangeId<TDoc> = TDoc extends { _id: infer TId }
  ? TId
  : TDoc extends { id: infer TId }
    ? TId
    : unknown;

export type GenericAuthTriggerChange<
  TDoc extends Record<string, unknown> = Record<string, unknown>,
  TId = TriggerChangeId<TDoc>,
> =
  | {
      id: TId;
      newDoc: TDoc;
      oldDoc: null;
      operation: 'insert';
    }
  | {
      id: TId;
      newDoc: TDoc;
      oldDoc: TDoc;
      operation: 'update';
    }
  | {
      id: TId;
      newDoc: null;
      oldDoc: TDoc;
      operation: 'delete';
    };

export type GenericAuthBeforeResult<TData extends Record<string, unknown>> =
  // biome-ignore lint/suspicious/noConfusingVoidType: before hooks intentionally support "return nothing".
  | void
  | false
  | {
      data: Partial<TData>;
    };

export type GenericAuthTriggerHandlers<
  DataModel extends GenericDataModel,
  TableName extends string,
  TriggerCtx,
  Doc extends Record<string, unknown> = TableDoc<DataModel, TableName>,
  InsertDoc extends Record<string, unknown> = InsertDocData<Doc>,
  UpdateDoc extends Record<string, unknown> = UpdateDocData<Doc>,
> = {
  change?: (
    change: GenericAuthTriggerChange<Doc>,
    ctx: TriggerCtx
  ) => MaybePromise<void>;
  create?: {
    after?: (doc: Doc, ctx: TriggerCtx) => MaybePromise<void>;
    before?: (
      data: InsertDoc,
      ctx: TriggerCtx
    ) => MaybePromise<GenericAuthBeforeResult<InsertDoc>>;
  };
  delete?: {
    after?: (doc: Doc, ctx: TriggerCtx) => MaybePromise<void>;
    before?: (
      doc: Doc,
      ctx: TriggerCtx
    ) => MaybePromise<GenericAuthBeforeResult<Doc>>;
  };
  update?: {
    after?: (newDoc: Doc, ctx: TriggerCtx) => MaybePromise<void>;
    before?: (
      update: UpdateDoc,
      ctx: TriggerCtx
    ) => MaybePromise<GenericAuthBeforeResult<UpdateDoc>>;
  };
};

export type GenericAuthTriggers<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
  TriggerCtx = unknown,
> = {
  [K in keyof Schema['tables'] & string]?: GenericAuthTriggerHandlers<
    DataModel,
    K,
    TriggerCtx
  >;
};

export type BetterAuthOptionsWithoutDatabase = Omit<
  BetterAuthOptions,
  'database'
>;

export type GenericAuthDefinition<
  GenericCtx = unknown,
  DataModel extends GenericDataModel = GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = SchemaDefinition<
    GenericSchema,
    true
  >,
  AuthOptions extends
    BetterAuthOptionsWithoutDatabase = BetterAuthOptionsWithoutDatabase,
> = (ctx: GenericCtx) => AuthOptions & {
  triggers?: GenericAuthTriggers<DataModel, Schema, GenericCtx>;
};

export const defineAuth = <
  GenericCtx = unknown,
  DataModel extends GenericDataModel = GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true> = SchemaDefinition<
    GenericSchema,
    true
  >,
  AuthOptions extends
    BetterAuthOptionsWithoutDatabase = BetterAuthOptionsWithoutDatabase,
>(
  definition: GenericAuthDefinition<GenericCtx, DataModel, Schema, AuthOptions>
) => definition;
