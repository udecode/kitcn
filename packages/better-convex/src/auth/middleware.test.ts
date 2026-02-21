import { authMiddleware } from './middleware';

describe('authMiddleware', () => {
  test('redirects OpenID well-known endpoint to auth route', async () => {
    const previous = process.env.CONVEX_SITE_URL;
    process.env.CONVEX_SITE_URL = 'https://example.convex.site';

    try {
      const middleware = authMiddleware(() => {
        throw new Error('should not create auth for well-known redirect');
      });

      const c = {
        req: {
          path: '/.well-known/openid-configuration',
          raw: new Request(
            'https://app.example/.well-known/openid-configuration'
          ),
        },
        redirect: (url: string) => Response.redirect(url, 302),
      } as any;

      const response = await middleware(c, async () => {});

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get('location')).toBe(
        'https://example.convex.site/api/auth/convex/.well-known/openid-configuration'
      );
    } finally {
      process.env.CONVEX_SITE_URL = previous;
    }
  });

  test('handles auth routes with getAuth handler', async () => {
    const handler = async (_request: Request) => new Response('auth-ok');
    const getAuth = ((_ctx: unknown) => ({ handler })) as any;

    const middleware = authMiddleware(getAuth as any, {
      basePath: '/auth',
    });
    const c = {
      env: { value: 1 },
      req: {
        path: '/auth/session',
        raw: new Request('https://app.example/auth/session'),
      },
    } as any;

    const response = await middleware(c, async () => {});

    expect(response).toBeInstanceOf(Response);
    expect(await (response as Response).text()).toBe('auth-ok');
  });

  test('maps APIError-like auth.handler throws to HTTP responses', async () => {
    const middleware = authMiddleware(
      (() => ({
        handler: async () => {
          throw Object.assign(new Error('invalid token'), {
            body: { code: 'INVALID_TOKEN', message: 'Invalid token' },
            headers: { 'x-auth-error': '1' },
            name: 'APIError',
            status: 'UNAUTHORIZED',
            statusCode: 401,
          });
        },
      })) as any,
      { basePath: '/auth' }
    );

    const c = {
      env: {},
      req: {
        path: '/auth/session',
        raw: new Request('https://app.example/auth/session'),
      },
    } as any;

    const response = await middleware(c, async () => {});

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect((response as Response).headers.get('x-auth-error')).toBe('1');
    await expect((response as Response).json()).resolves.toEqual({
      code: 'INVALID_TOKEN',
      message: 'Invalid token',
    });
  });

  test('calls next for non-auth routes', async () => {
    const middleware = authMiddleware(() => {
      throw new Error('should not create auth outside auth paths');
    });

    const next = spyOn(
      {
        fn: async () => {},
      },
      'fn'
    );

    const c = {
      req: {
        path: '/api/posts',
        raw: new Request('https://app.example/api/posts'),
      },
    } as any;

    const response = await middleware(c, next);

    expect(response).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('logs request and response headers in verbose mode', async () => {
    const logs: unknown[][] = [];
    const logSpy = spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args);
    });

    try {
      const middleware = authMiddleware(
        (() => ({
          handler: async () =>
            new Response('ok', {
              headers: { 'x-test': '1' },
            }),
        })) as any,
        { basePath: '/auth', verbose: true }
      );

      const c = {
        env: {},
        req: {
          path: '/auth/test',
          raw: new Request('https://app.example/auth/test', {
            headers: { authorization: 'Bearer token' },
          }),
        },
      } as any;

      await middleware(c, async () => {});

      expect(logs.length).toBe(2);
      expect(logs[0]?.[0]).toBe('request headers');
      expect(logs[1]?.[0]).toBe('response headers');
    } finally {
      logSpy.mockRestore();
    }
  });
});
