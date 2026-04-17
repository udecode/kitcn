import { convexBetterAuth } from './index';

describe('convexBetterAuth', () => {
  test('creates GET/POST handlers that rewrite request URL to convex site', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      calls.push({ init, input });
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
        new Request('https://example.com/other?b=2', {
          body: JSON.stringify({ email: 'user@example.com' }),
          headers: {
            'content-type': 'application/json',
          },
          method: 'POST',
        })
      );

      expect(calls).toHaveLength(2);

      expect(calls[0]?.input).toBe('https://my-app.convex.site/path?a=1');
      expect(calls[0]?.init?.method).toBe('GET');
      expect(calls[0]?.init?.redirect).toBe('manual');
      const getHeaders = new Headers(calls[0]?.init?.headers);
      expect(getHeaders.get('accept-encoding')).toBe('application/json');
      expect(getHeaders.get('host')).toBe('my-app.convex.site');
      expect(getHeaders.get('x-forwarded-host')).toBe('example.com');
      expect(getHeaders.get('x-forwarded-proto')).toBe('https');
      expect(getHeaders.get('x-better-auth-forwarded-host')).toBe(
        'example.com'
      );
      expect(getHeaders.get('x-better-auth-forwarded-proto')).toBe('https');
      expect(calls[0]?.init?.body).toBeUndefined();

      expect(calls[1]?.input).toBe('https://my-app.convex.site/other?b=2');
      expect(calls[1]?.init?.method).toBe('POST');
      expect(calls[1]?.init?.redirect).toBe('manual');
      const postHeaders = new Headers(calls[1]?.init?.headers);
      expect(postHeaders.get('accept-encoding')).toBe('application/json');
      expect(postHeaders.get('host')).toBe('my-app.convex.site');
      expect(postHeaders.get('x-forwarded-host')).toBe('example.com');
      expect(postHeaders.get('x-forwarded-proto')).toBe('https');
      expect(postHeaders.get('x-better-auth-forwarded-host')).toBe(
        'example.com'
      );
      expect(postHeaders.get('x-better-auth-forwarded-proto')).toBe('https');
      await expect(
        new Response(calls[1]?.init?.body as BodyInit).text()
      ).resolves.toBe(JSON.stringify({ email: 'user@example.com' }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
