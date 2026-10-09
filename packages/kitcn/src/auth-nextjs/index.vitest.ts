import { createServer } from 'node:http';

import { afterEach, describe, expect, test, vi } from 'vitest';
import { base64url } from 'jose';

import * as tokenModule from '../auth/internal/token';
import { convexBetterAuth } from './index';

describe('convexBetterAuth (Node)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('reuses a cached JWT with an app-owned async clock', async () => {
    const token = `eyJhbGciOiJIUzI1NiJ9.${base64url.encode(JSON.stringify({ exp: 2000 }))}.cHJvb2Y`;
    const fetch = vi.fn(async () => Response.json({ token: 'refreshed-token' }));
    vi.stubGlobal('fetch', fetch);
    const { createContext } = convexBetterAuth({
      api: {},
      auth: { jwtCache: { now: async () => 1000 } },
      convexSiteUrl: 'https://example.convex.site',
    });
    const headers = new Headers({ cookie: `better-auth.convex_jwt=${token}` });
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock read in runtime prerender');
    });

    const context = await createContext({ headers });
    expect(context.token).toBe(token);
    expect(clock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('jwtCache false disables caching without disabling auth', async () => {
    const getToken = vi
      .spyOn(tokenModule, 'getToken')
      .mockResolvedValue({ isFresh: true, token: 'token' });
    const isUnauthorized = () => false;
    const { createContext } = convexBetterAuth({
      api: {},
      auth: {
        expirationToleranceSeconds: 15,
        isUnauthorized,
        jwtCache: false,
      },
      convexSiteUrl: 'https://example.convex.site',
    });

    await createContext({
      headers: new Headers({ connection: 'keep-alive' }),
    });

    expect(getToken).toHaveBeenCalledOnce();
    const [siteUrl, headers, options] = getToken.mock.calls[0] ?? [];
    expect(siteUrl).toBe('https://example.convex.site');
    expect(headers?.get('connection')).toBeNull();
    expect(headers?.get('accept-encoding')).toBe('identity');
    expect(options).toMatchObject({
      jwtCache: {
        enabled: false,
        expirationToleranceSeconds: 15,
        isAuthError: isUnauthorized,
      },
    });
  });

  test('POST handler forwards non-2xx upstream responses', async () => {
    let requestBody = '';
    const server = createServer((req, res) => {
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        requestBody += chunk;
      });
      req.on('end', () => {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Invalid email or password',
            path: req.url,
          })
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('expected tcp server address');
      }

      const result = convexBetterAuth({
        api: {},
        convexSiteUrl: `http://127.0.0.1:${address.port}`,
      });

      const response = await result.handler.POST(
        new Request(
          'https://app.example/api/auth/sign-in/email?redirect=false',
          {
            body: JSON.stringify({
              email: 'user@example.com',
              password: 'wrong-password',
            }),
            headers: {
              'content-type': 'application/json',
            },
            method: 'POST',
          }
        )
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
        path: '/api/auth/sign-in/email?redirect=false',
      });
      expect(requestBody).toBe(
        JSON.stringify({
          email: 'user@example.com',
          password: 'wrong-password',
        })
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
