import {
  getAuthUserId,
  getAuthUserIdentity,
  getHeaders,
  getSession,
} from './helpers';

describe('getAuthUserIdentity', () => {
  test('returns null when identity is missing', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => null,
      },
    };

    expect(await getAuthUserIdentity(ctx as any)).toBeNull();
  });

  test('maps session and user ids from identity', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          issuer: 'issuer',
          sessionId: 'session-1',
          subject: 'user-1',
          tokenIdentifier: 'ti',
        }),
      },
    };

    const identity = await getAuthUserIdentity(ctx as any);

    expect(identity).toMatchObject({
      issuer: 'issuer',
      sessionId: 'session-1',
      subject: 'user-1',
      userId: 'user-1',
    });
  });
});

describe('getAuthUserId', () => {
  test('returns null without identity', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => null,
      },
    };

    expect(await getAuthUserId(ctx as any)).toBeNull();
  });

  test('returns identity subject', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          sessionId: 'session-1',
          subject: 'user-1',
        }),
      },
    };

    expect(await getAuthUserId(ctx as any)).toBe('user-1');
  });
});

describe('getSession', () => {
  test('uses explicit session id when provided', async () => {
    const dbGet = spyOn(
      {
        db: {
          get: async (sessionId: string) => ({ _id: sessionId }),
        },
      }.db,
      'get'
    );

    const ctx = {
      auth: {
        getUserIdentity: async () => {
          throw new Error('should not be called');
        },
      },
      db: {
        get: dbGet,
      },
    };

    const session = await getSession(ctx as any, 'explicit-session' as any);

    expect(session).toEqual({ _id: 'explicit-session' });
    expect(dbGet).toHaveBeenCalledWith('explicit-session');
  });

  test('returns null when no identity and no explicit session id', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => null,
      },
      db: {
        get: async () => ({ _id: 'unexpected' }),
      },
    };

    expect(await getSession(ctx as any)).toBeNull();
  });

  test('resolves session from authenticated identity', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          sessionId: 'identity-session',
          subject: 'user-1',
        }),
      },
      db: {
        get: async (sessionId: string) => ({
          _id: sessionId,
          token: 'token-1',
        }),
      },
    };

    const session = await getSession(ctx as any);
    expect(session).toEqual({
      _id: 'identity-session',
      token: 'token-1',
    });
  });

  test('returns null when identity exists but sessionId is missing', async () => {
    const dbGet = mock(async (_sessionId: string) => ({ _id: 'unexpected' }));
    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          subject: 'user-1',
          tokenIdentifier: 'ti',
        }),
      },
      db: {
        get: dbGet,
      },
    };

    expect(await getSession(ctx as any)).toBeNull();
    expect(dbGet).not.toHaveBeenCalled();
  });

  test('prefers orm session query when orm exists', async () => {
    const ormFindFirst = mock(async (_args: unknown) => ({
      _id: 'orm-session',
      token: 'orm-token',
    }));
    const dbGet = mock(async (_sessionId: string) => ({
      _id: 'db-session',
      token: 'db-token',
    }));

    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          sessionId: 'identity-session',
          subject: 'user-1',
        }),
      },
      db: {
        get: dbGet,
      },
      orm: {
        query: {
          session: {
            findFirst: ormFindFirst,
          },
        },
      },
    };

    const session = await getSession(ctx as any);

    expect(session).toEqual({
      _id: 'orm-session',
      token: 'orm-token',
    });
    expect(ormFindFirst).toHaveBeenCalledWith({
      where: { id: 'identity-session' },
    });
    expect(dbGet).not.toHaveBeenCalled();
  });
});

describe('getHeaders', () => {
  test('returns empty headers when no session', async () => {
    const headers = await getHeaders(
      {
        auth: {
          getUserIdentity: async () => null,
        },
        db: {
          get: async () => null,
        },
      } as any,
      null
    );

    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBeNull();
  });

  test('maps token and ipAddress from session', async () => {
    const headers = await getHeaders(
      {
        auth: {
          getUserIdentity: async () => null,
        },
        db: {
          get: async () => null,
        },
      } as any,
      {
        token: 'abc',
        ipAddress: '127.0.0.1',
      } as any
    );

    expect(headers.get('authorization')).toBe('Bearer abc');
    expect(headers.get('x-forwarded-for')).toBe('127.0.0.1');
  });

  test('falls back to cookie-backed session when JWT identity is missing', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => null,
      },
      db: {
        get: async () => null,
      },
      req: {
        headers: new Headers({
          cookie: 'better-auth.session_token=SESSION_TOKEN',
        }),
      },
    };

    const headers = await getHeaders(ctx as any);

    expect(headers.get('authorization')).toBe('Bearer SESSION_TOKEN');
  });

  test('falls back to secure cookie-backed session token name in production', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => null,
      },
      db: {
        get: async () => null,
      },
      req: {
        headers: new Headers({
          cookie: '__Secure-better-auth.session_token=SECURE_SESSION_TOKEN',
        }),
      },
    };

    const headers = await getHeaders(ctx as any);

    expect(headers.get('authorization')).toBe('Bearer SECURE_SESSION_TOKEN');
  });

  test('falls back to custom-prefix session token cookie name', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => null,
      },
      db: {
        get: async () => null,
      },
      req: {
        headers: new Headers({
          cookie: 'my-prefix.session_token=CUSTOM_PREFIX_TOKEN',
        }),
      },
    };

    const headers = await getHeaders(ctx as any);

    expect(headers.get('authorization')).toBe('Bearer CUSTOM_PREFIX_TOKEN');
  });
});
