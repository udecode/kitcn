import type { GenericQueryCtx } from 'convex/server';
import type { GenericId } from 'convex/values';
import type { QueryCtxWithOrmQueryTable } from '../orm/query-context';
import { getSession } from './helpers';

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
      userId: string;
    },
    '_creationTime' | '_id' | 'token' | 'userId'
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
  userId: string;
};

declare const baseCtx: GenericQueryCtx<TestDataModel>;
declare const ormCtx: QueryCtxWithOrmQueryTable<typeof baseCtx, 'session'>;
declare const typedOrmCtx: GenericQueryCtx<TestDataModel> & {
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
declare const invalidOrmCtx: GenericQueryCtx<TestDataModel> & {
  orm: {};
};

void getSession(baseCtx);
void getSession(ormCtx);
void getSession(ormCtx, 'session-id' as GenericId<'session'>);
const ormSession = getSession(typedOrmCtx);
const _ormSessionOk: Promise<OrmSessionRow | null> = ormSession;

// biome-ignore format: keep @ts-expect-error bound to assignment
// @ts-expect-error orm ctx session should return orm row shape, not Doc shape
const _ormSessionWrong: Promise<{ _id: GenericId<'session'> } | null> = ormSession;

// biome-ignore format: keep @ts-expect-error bound to call expression
// @ts-expect-error session id must match session table id
void getSession(ormCtx, 'user-id' as GenericId<'user'>);

// biome-ignore format: keep @ts-expect-error bound to call expression
// @ts-expect-error if ctx.orm exists it must include query.session.findFirst
void getSession(invalidOrmCtx);
