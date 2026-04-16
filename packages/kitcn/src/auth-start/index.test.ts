import { describe, expect, test } from 'bun:test';
import { convexBetterAuthReactStart } from './index';

describe('auth/start', () => {
  test('re-exports the react-start helper surface', () => {
    expect(typeof convexBetterAuthReactStart).toBe('function');
  });

  test('preserves original forwarded host headers before proxying to Convex site', async () => {
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
      const auth = convexBetterAuthReactStart({
        convexSiteUrl: 'https://my-app.convex.site',
        convexUrl: 'https://my-app.convex.cloud',
      });

      await auth.handler(
        new Request('https://app.example.com/api/auth/session', {
          method: 'GET',
        })
      );

      expect(calls).toHaveLength(1);
      expect(calls[0]?.input).toBe(
        'https://my-app.convex.site/api/auth/session'
      );

      const headers = new Headers(calls[0]?.init?.headers);
      expect(headers.get('host')).toBe('my-app.convex.site');
      expect(headers.get('x-forwarded-host')).toBe('app.example.com');
      expect(headers.get('x-forwarded-proto')).toBe('https');
      expect(headers.get('x-better-auth-forwarded-host')).toBe(
        'app.example.com'
      );
      expect(headers.get('x-better-auth-forwarded-proto')).toBe('https');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
