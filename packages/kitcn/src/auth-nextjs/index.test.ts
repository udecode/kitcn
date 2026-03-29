import { convexBetterAuth } from './index';

describe('convexBetterAuth', () => {
  test('creates GET/POST handlers that rewrite request URL to convex site', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{
      request: Request;
      init?: RequestInit;
    }> = [];

    globalThis.fetch = (async (request: Request, init?: RequestInit) => {
      calls.push({ init, request });
      return new Response('ok');
    }) as typeof fetch;

    try {
      const result = convexBetterAuth({
        api: {},
        convexSiteUrl: 'https://my-app.convex.site',
      });

      await result.handler.GET(
        new Request('https://example.com/path?a=1', { method: 'GET' })
      );
      await result.handler.POST(
        new Request('https://example.com/other?b=2', { method: 'POST' })
      );

      expect(calls).toHaveLength(2);

      expect(calls[0]?.request.url).toBe('https://my-app.convex.site/path?a=1');
      expect(calls[0]?.request.headers.get('accept-encoding')).toBe(
        'application/json'
      );
      expect(calls[0]?.request.headers.get('host')).toBe('my-app.convex.site');
      expect(calls[0]?.init).toMatchObject({
        method: 'GET',
        redirect: 'manual',
      });

      expect(calls[1]?.request.url).toBe(
        'https://my-app.convex.site/other?b=2'
      );
      expect(calls[1]?.init).toMatchObject({
        method: 'POST',
        redirect: 'manual',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
