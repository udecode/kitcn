import type {
  DocumentByName,
  GenericQueryCtx,
  TableNamesInDataModel,
} from 'convex/server';

type InferCtxDataModel<TCtx extends GenericQueryCtx<any>> =
  TCtx extends GenericQueryCtx<infer DataModel> ? DataModel : never;

export type DocByCtx<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> = DocumentByName<InferCtxDataModel<TCtx>, TableName>;

export type QueryCtxWithOptionalOrmQueryTable<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> = TCtx & {
  orm?: {
    query?: {
      [K in TableName]?: {
        findFirst?: (...args: any[]) => unknown;
      };
    };
  };
};

export type QueryCtxWithOrmQueryTable<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> = TCtx & {
  orm: {
    query: {
      [K in TableName]-?: {
        findFirst: (...args: any[]) => unknown;
      };
    };
  };
};

type OrmQueryByCtx<TCtx extends GenericQueryCtx<any>> = TCtx extends {
  orm: { query: infer TQuery };
}
  ? TQuery
  : never;

type OrmQueryEntryByCtx<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> = TableName extends keyof OrmQueryByCtx<TCtx>
  ? NonNullable<OrmQueryByCtx<TCtx>[TableName]>
  : never;

type HasOrmFindFirstByCtx<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> = [OrmQueryEntryByCtx<TCtx, TableName>] extends [never]
  ? false
  : OrmQueryEntryByCtx<TCtx, TableName> extends {
        findFirst: (...args: any[]) => unknown;
      }
    ? true
    : false;

export type QueryCtxWithPreferredOrmQueryTable<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> = TCtx extends { orm: unknown }
  ? HasOrmFindFirstByCtx<TCtx, TableName> extends true
    ? TCtx
    : never
  : TCtx;

type OrmQueryRowByCtx<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> = OrmQueryEntryByCtx<TCtx, TableName> extends {
  _: {
    baseResult: infer TResult;
  };
}
  ? TResult
  : never;

export type LookupByIdResultByCtx<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
> =
  | (TCtx extends { orm: unknown }
      ? OrmQueryRowByCtx<TCtx, TableName>
      : DocByCtx<TCtx, TableName>)
  | null;

export async function getByIdWithOrmQueryFallback<
  TCtx extends GenericQueryCtx<any>,
  TableName extends TableNamesInDataModel<InferCtxDataModel<TCtx>>,
>(
  ctx: QueryCtxWithPreferredOrmQueryTable<TCtx, TableName>,
  tableName: TableName,
  id: DocByCtx<TCtx, TableName>['_id']
): Promise<LookupByIdResultByCtx<TCtx, TableName>> {
  const lookupCtx = ctx as QueryCtxWithOptionalOrmQueryTable<TCtx, TableName>;
  const ormTableQuery = lookupCtx.orm?.query?.[tableName];
  if (ormTableQuery?.findFirst) {
    return (await ormTableQuery.findFirst({
      where: { id },
    })) as LookupByIdResultByCtx<TCtx, TableName>;
  }

  return (await ctx.db.get(id as any)) as LookupByIdResultByCtx<
    TCtx,
    TableName
  >;
}
