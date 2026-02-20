import type { BetterAuthOptions } from 'better-auth';
import type {
  DocumentByName,
  GenericDataModel,
  GenericSchema,
  SchemaDefinition,
  TableNamesInDataModel,
} from 'convex/server';

type MaybePromise<T> = T | Promise<T>;

type TableDoc<
  DataModel extends GenericDataModel,
  TableName extends string,
> = TableName extends TableNamesInDataModel<DataModel>
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

export type GenericAuthTriggerHandlers<
  DataModel extends GenericDataModel,
  TableName extends string,
  Doc extends Record<string, unknown> = TableDoc<DataModel, TableName>,
  InsertDoc extends Record<string, unknown> = InsertDocData<Doc>,
  UpdateDoc extends Record<string, unknown> = UpdateDocData<Doc>,
> = {
  beforeCreate?: (data: InsertDoc) => MaybePromise<InsertDoc>;
  beforeDelete?: (doc: Doc) => MaybePromise<Doc>;
  beforeUpdate?: (
    doc: Doc,
    update: UpdateDoc
  ) => MaybePromise<UpdateDoc | undefined>;
  onCreate?: (doc: Doc) => MaybePromise<void>;
  onDelete?: (doc: Doc) => MaybePromise<void>;
  onUpdate?: (newDoc: Doc, oldDoc: Doc) => MaybePromise<void>;
};

export type GenericAuthTriggers<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
> = {
  [K in keyof Schema['tables'] & string]?: GenericAuthTriggerHandlers<
    DataModel,
    K
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
  triggers?: GenericAuthTriggers<DataModel, Schema>;
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
