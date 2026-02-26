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

const SESSION_TOKEN_COOKIE_NAME = 'better-auth.session_token';

const parseSessionTokenFromCookie = (cookieHeader: string | null) => {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(';');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    const equalsIndex = part.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const cookieName = part.slice(0, equalsIndex);
    const normalizedCookieName = cookieName.startsWith('__Secure-')
      ? cookieName.slice('__Secure-'.length)
      : cookieName;
    const isSessionTokenCookie =
      normalizedCookieName === SESSION_TOKEN_COOKIE_NAME ||
      normalizedCookieName.endsWith('.session_token') ||
      normalizedCookieName === 'session_token';
    if (!isSessionTokenCookie) {
      continue;
    }

    const value = part.slice(equalsIndex + 1);
    return value ? decodeURIComponent(value) : null;
  }

  return null;
};

const getCookieHeaderFromCtx = (ctx: unknown): string | null => {
  const req = (ctx as { req?: { headers?: Headers | Record<string, string> } })
    ?.req;
  const headers = req?.headers;

  if (!headers) {
    return null;
  }

  if (headers instanceof Headers) {
    return headers.get('cookie');
  }

  const cookie =
    headers.cookie ??
    headers.Cookie ??
    headers['set-cookie'] ??
    headers['Set-Cookie'];
  return typeof cookie === 'string' ? cookie : null;
};

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
    const sessionToken = parseSessionTokenFromCookie(
      getCookieHeaderFromCtx(ctx)
    );
    if (sessionToken) {
      return new Headers({
        authorization: `Bearer ${sessionToken}`,
      });
    }
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
