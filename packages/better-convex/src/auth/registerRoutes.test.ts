import { httpRouter } from 'convex/server';
import { Request as UndiciRequest } from 'undici';

import { registerRoutes } from './registerRoutes';

const unwrapLocation = (response: Response) =>
  response.headers.get('location') ?? response.headers.get('Location');

const unwrapInvoke = async (
  endpoint: unknown,
  request: Request
): Promise<Response> => {
  if (
    !endpoint ||
    (typeof endpoint !== 'object' && typeof endpoint !== 'function')
  ) {
    throw new Error('Expected a PublicHttpAction-like value');
  }

  const invokeHttpAction = (endpoint as any).invokeHttpAction as
    | ((request: Request) => Promise<Response>)
    | undefined;
  if (invokeHttpAction) {
    return invokeHttpAction(request);
  }

  if (typeof endpoint === 'function') {
    return (endpoint as any)({} as any, request);
  }

  throw new Error('Expected endpoint.invokeHttpAction or a callable handler');
};

describe('registerRoutes', () => {
  test('registers well-known redirect and GET/POST auth routes when cors is disabled', async () => {
    const previous = process.env.CONVEX_SITE_URL;
    process.env.CONVEX_SITE_URL = 'https://example.convex.site';

    try {
      const http = httpRouter();

      const getAuth = () => ({
        handler: async () => new Response('ok'),
        options: { basePath: '/api/auth' },
        $context: Promise.resolve({ options: { trustedOrigins: [] } }),
      });

      registerRoutes(http as any, getAuth as any, { cors: false });

      expect(http.lookup('/.well-known/openid-configuration', 'GET')).not.toBe(
        null
      );
      expect(http.lookup('/api/auth/session', 'GET')).not.toBe(null);
      expect(http.lookup('/api/auth/session', 'POST')).not.toBe(null);

      const wellKnown = http.lookup(
        '/.well-known/openid-configuration',
        'GET'
      )!;
      const redirect = await unwrapInvoke(
        wellKnown[0],
        new UndiciRequest(
          'https://example.convex.site/.well-known/openid-configuration'
        ) as any
      );
      expect(redirect.status).toBe(302);
      expect(unwrapLocation(redirect)).toBe(
        'https://example.convex.site/api/auth/convex/.well-known/openid-configuration'
      );

      const authGet = http.lookup('/api/auth/session', 'GET')!;
      const authRes = await unwrapInvoke(
        authGet[0],
        new UndiciRequest('https://example.convex.site/api/auth/session', {
          method: 'GET',
        }) as any
      );
      expect(await authRes.text()).toBe('ok');
    } finally {
      process.env.CONVEX_SITE_URL = previous;
    }
  });

  test('maps APIError-like auth.handler throws to HTTP responses', async () => {
    const http = httpRouter();
    const getAuth = () => ({
      handler: async () => {
        throw Object.assign(new Error('unauthorized'), {
          body: { code: 'INVALID_TOKEN', message: 'Invalid token' },
          headers: { 'x-auth-error': '1' },
          name: 'APIError',
          status: 'UNAUTHORIZED',
          statusCode: 401,
        });
      },
      options: { basePath: '/api/auth' },
      $context: Promise.resolve({ options: { trustedOrigins: [] } }),
    });

    registerRoutes(http as any, getAuth as any, { cors: false });

    const authGet = http.lookup('/api/auth/session', 'GET')!;
    const authRes = await unwrapInvoke(
      authGet[0],
      new UndiciRequest('https://example.convex.site/api/auth/session', {
        method: 'GET',
      }) as any
    );

    expect(authRes.status).toBe(401);
    expect(authRes.headers.get('x-auth-error')).toBe('1');
    await expect(authRes.json()).resolves.toEqual({
      code: 'INVALID_TOKEN',
      message: 'Invalid token',
    });
  });

  test('does not re-register the well-known redirect if already present', () => {
    const http = httpRouter();
    const wellKnownHandler = {
      invokeHttpAction: async () => new Response('x'),
    };
    http.route({
      handler: wellKnownHandler as any,
      method: 'GET',
      path: '/.well-known/openid-configuration',
    });

    const getAuth = () => ({
      handler: async () => new Response('ok'),
      options: { basePath: '/auth' },
      $context: Promise.resolve({ options: { trustedOrigins: [] } }),
    });

    registerRoutes(http as any, getAuth as any, { cors: false });

    const lookedUp = http.lookup('/.well-known/openid-configuration', 'GET')!;
    expect(lookedUp[0]).toBe(wellKnownHandler as any);

    expect(http.lookup('/auth/session', 'GET')).not.toBe(null);
    expect(http.lookup('/auth/session', 'POST')).not.toBe(null);
  });

  test('when cors is enabled, registers preflight OPTIONS and strips trailing wildcards from trusted origins', async () => {
    const http = httpRouter();
    const authHandler = mock(async () => new Response('ok'));
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    const getAuth = () => ({
      handler: authHandler,
      options: { basePath: '/api/auth' },
      $context: Promise.resolve({
        options: {
          trustedOrigins: ['https://trusted.example*'],
        },
      }),
    });

    try {
      registerRoutes(http as any, getAuth as any, {
        cors: {
          allowedHeaders: ['X-Test'],
          allowedOrigins: ['https://extra.example'],
          exposedHeaders: ['X-Expose'],
        },
        verbose: true,
      });

      expect(http.lookup('/api/auth/session', 'GET')).not.toBe(null);
      expect(http.lookup('/api/auth/session', 'POST')).not.toBe(null);
      expect(http.lookup('/api/auth/session', 'OPTIONS')).not.toBe(null);

      const optionsMatch = http.lookup('/api/auth/session', 'OPTIONS')!;
      const optionsRes = await unwrapInvoke(
        optionsMatch[0],
        new UndiciRequest('https://example.convex.site/api/auth/session', {
          method: 'OPTIONS',
          headers: { origin: 'https://trusted.example' },
        }) as any
      );

      expect(optionsRes.status).toBe(204);

      const allowedOriginsCall = (logSpy as any).mock.calls.find(
        (call: unknown[]) => call[0] === 'allowed origins'
      );
      expect(allowedOriginsCall?.[1]).toContain('https://trusted.example');

      const allowOrigin =
        optionsRes.headers.get('access-control-allow-origin') ??
        optionsRes.headers.get('Access-Control-Allow-Origin');
      expect(allowOrigin).toBe('https://trusted.example');
      expect(optionsRes.headers.get('access-control-allow-methods')).toContain(
        'GET'
      );
      expect(optionsRes.headers.get('access-control-allow-methods')).toContain(
        'POST'
      );
      expect(optionsRes.headers.get('access-control-allow-headers')).toContain(
        'Better-Auth-Cookie'
      );
      expect(optionsRes.headers.get('access-control-allow-headers')).toContain(
        'X-Test'
      );

      const getMatch = http.lookup('/api/auth/session', 'GET')!;
      const getRes = await unwrapInvoke(
        getMatch[0],
        new UndiciRequest('https://example.convex.site/api/auth/session', {
          method: 'GET',
          headers: { origin: 'https://extra.example' },
        }) as any
      );

      expect(getRes.headers.get('access-control-allow-origin')).toBe(
        'https://extra.example'
      );
      expect(getRes.headers.get('access-control-allow-credentials')).toBe(
        'true'
      );
      expect(getRes.headers.get('vary')).toBe('Origin');
      expect(getRes.headers.get('access-control-expose-headers')).toContain(
        'Set-Better-Auth-Cookie'
      );
      expect(getRes.headers.get('access-control-expose-headers')).toContain(
        'X-Expose'
      );

      expect(authHandler).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
    }
  });
});
