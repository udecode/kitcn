import type {
  DocumentByName,
  GenericDataModel,
  GenericQueryCtx,
} from 'convex/server';
import {
  type DocByCtx,
  getByIdWithOrmQueryFallback,
  type LookupByIdResultByCtx,
  type QueryCtxWithPreferredOrmQueryTable,
} from '../orm/query-context';

type SessionDoc<TCtx extends GenericQueryCtx<any>> = DocByCtx<TCtx, 'session'>;
type SessionResult<TCtx extends GenericQueryCtx<any>> = LookupByIdResultByCtx<
  TCtx,
  'session'
>;
type SessionLookupCtx<TCtx extends GenericQueryCtx<any>> =
  QueryCtxWithPreferredOrmQueryTable<TCtx, 'session'>;

export const getAuthUserIdentity = async <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>
) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  return {
    ...identity,
    sessionId: identity.sessionId as DocumentByName<
      DataModel,
      'session'
    >['_id'],
    userId: identity.subject as DocumentByName<DataModel, 'user'>['_id'],
  };
};

export const getAuthUserId = async <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>
) => {
  const identity = await getAuthUserIdentity(ctx);

  if (!identity) {
    return null;
  }

  return identity.subject;
};

export async function getSession<TCtx extends GenericQueryCtx<any>>(
  ctx: TCtx & SessionLookupCtx<TCtx>,
  _sessionId?: SessionDoc<TCtx>['_id']
): Promise<SessionResult<TCtx>> {
  let sessionId = _sessionId;

  if (!sessionId) {
    const identity = await getAuthUserIdentity(ctx);

    if (!identity) {
      return null;
    }

    sessionId = identity.sessionId;
  }

  if (!sessionId) {
    return null;
  }

  return await getByIdWithOrmQueryFallback<TCtx, 'session'>(
    ctx,
    'session',
    sessionId
  );
}

export const getHeaders = async <TCtx extends GenericQueryCtx<any>>(
  ctx: TCtx & QueryCtxWithPreferredOrmQueryTable<TCtx, 'session'>,
  session?: SessionResult<TCtx> | null
) => {
  const resolvedSession = (session ?? (await getSession<TCtx>(ctx))) as {
    ipAddress?: string | null;
    token?: string | null;
  } | null;

  if (!resolvedSession) {
    return new Headers();
  }

  return new Headers({
    ...(resolvedSession?.token
      ? { authorization: `Bearer ${resolvedSession.token}` }
      : {}),
    ...(resolvedSession?.ipAddress
      ? { 'x-forwarded-for': resolvedSession.ipAddress as string }
      : {}),
  });
};
