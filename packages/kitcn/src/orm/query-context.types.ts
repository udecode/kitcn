import type { GenericQueryCtx } from 'convex/server';
import type { GenericId } from 'convex/values';
import {
  getByIdWithOrmQueryFallback,
  type QueryCtxWithOptionalOrmQueryTable,
  type QueryCtxWithOrmQueryTable,
} from './query-context';

type TableDef<Doc, Fields extends string> = {
  document: Doc;
  fieldPaths: Fields;
  indexes: {
    by_creation_time: ['_creationTime'];
    by_id: ['_id'];
  };
  searchIndexes: {};
  vectorIndexes: {};
};

type TestDataModel = {
  session: TableDef<
    {
      _creationTime: number;
      _id: GenericId<'session'>;
      token: string;
    },
    '_creationTime' | '_id' | 'token'
  >;
  user: TableDef<
    {
      _creationTime: number;
      _id: GenericId<'user'>;
      name: string;
    },
    '_creationTime' | '_id' | 'name'
  >;
};

type OrmSessionRow = {
  createdAt: number;
  id: string;
  token: string;
};

declare const ctx: GenericQueryCtx<TestDataModel>;
declare const sessionCtx: QueryCtxWithOptionalOrmQueryTable<
  typeof ctx,
  'session'
>;
declare const ormSessionCtx: QueryCtxWithOrmQueryTable<typeof ctx, 'session'>;
declare const typedOrmSessionCtx: GenericQueryCtx<TestDataModel> & {
  orm: {
    query: {
      session: {
        _: {
          baseResult: OrmSessionRow;
        };
        findFirst: (_args: {
          where: {
            id: GenericId<'session'>;
          };
        }) => Promise<OrmSessionRow | null>;
      };
    };
  };
};
declare const invalidOrmSessionCtx: GenericQueryCtx<TestDataModel> & {
  orm: {
    query: {
      session: {};
    };
  };
};

void getByIdWithOrmQueryFallback(
  sessionCtx,
  'session',
  'session-id' as GenericId<'session'>
);
void getByIdWithOrmQueryFallback(
  ormSessionCtx,
  'session',
  'session-id' as GenericId<'session'>
);
const ormLookup = getByIdWithOrmQueryFallback(
  typedOrmSessionCtx,
  'session',
  'session-id' as GenericId<'session'>
);
const _ormLookupOk: Promise<OrmSessionRow | null> = ormLookup;

// biome-ignore format: keep @ts-expect-error bound to assignment
// @ts-expect-error orm ctx lookup should return orm row shape, not Doc shape
const _ormLookupWrong: Promise<{ _id: GenericId<'session'> } | null> = ormLookup;

// biome-ignore format: keep @ts-expect-error bound to assignment
// @ts-expect-error orm variant requires ctx.orm.query.session.findFirst
const _invalidOrmCtx: QueryCtxWithOrmQueryTable<typeof ctx, 'session'> = ctx;

// biome-ignore format: keep @ts-expect-error bound to call expression
// @ts-expect-error id must match the selected table document id
void getByIdWithOrmQueryFallback(sessionCtx, 'session', 'user-id' as GenericId<'user'>);

// biome-ignore format: keep @ts-expect-error bound to call expression
// @ts-expect-error selected table key must exist on the data model
void getByIdWithOrmQueryFallback(sessionCtx, 'missing', 'session-id' as GenericId<'session'>);

// biome-ignore format: keep @ts-expect-error bound to call expression
// @ts-expect-error if ctx.orm exists it must provide query.table.findFirst
void getByIdWithOrmQueryFallback(invalidOrmSessionCtx, 'session', 'session-id' as GenericId<'session'>);
