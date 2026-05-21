import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { syncConvexAuthForStartLoader } from './index';
import { convexBetterAuthReactStart } from './server';

describe('auth/start', () => {
  test('keeps the server import traceable without poisoning the shared entry', () => {
    const sharedSource = readFileSync(
      path.join(import.meta.dir, 'index.ts'),
      'utf8'
    );
    const serverSource = readFileSync(
      path.join(import.meta.dir, 'server.ts'),
      'utf8'
    );

    expect(sharedSource).not.toContain('@tanstack/react-start/server');
    expect(serverSource).toContain("from '@tanstack/react-start/server'");
  });

  test('keeps the shared loader entry browser-bundleable', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      logLevel: 'silent',
      platform: 'browser',
      stdin: {
        contents: `
          import { syncConvexAuthForStartLoader } from './index';
          console.log(syncConvexAuthForStartLoader);
        `,
        loader: 'ts',
        resolveDir: import.meta.dir,
        sourcefile: 'entry.ts',
      },
      write: false,
    });
    const code = result.outputFiles[0]?.text ?? '';

    expect(code).not.toContain('@tanstack/react-start/server');
    expect(code).not.toContain('node:async_hooks');
  });

  test('exports the react-start server helper surface', () => {
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

  test('syncs Convex auth before client-side route loaders run', async () => {
    const clearAuth = mock(() => {});
    const setAuth = mock((_fetchToken: () => Promise<string | null>) => {});
    const convex = { clearAuth, setAuth };

    const first = await syncConvexAuthForStartLoader({
      convex,
      getToken: async () => 'first-token',
    });

    expect(first).toEqual({
      isAuthenticated: true,
      token: 'first-token',
    });
    expect(setAuth).toHaveBeenCalledTimes(1);
    await expect(setAuth.mock.calls[0]![0]()).resolves.toBe('first-token');

    await syncConvexAuthForStartLoader({
      convex,
      getToken: async () => 'first-token',
    });

    expect(setAuth).toHaveBeenCalledTimes(1);

    await syncConvexAuthForStartLoader({
      convex,
      getToken: async () => 'second-token',
    });

    expect(setAuth).toHaveBeenCalledTimes(2);
    await expect(setAuth.mock.calls[1]![0]()).resolves.toBe('second-token');

    const signedOut = await syncConvexAuthForStartLoader({
      convex,
      getToken: async () => null,
    });

    expect(signedOut).toEqual({
      isAuthenticated: false,
      token: null,
    });
    expect(clearAuth).toHaveBeenCalledTimes(1);
  });

  test('syncs auth through a ConvexQueryClient target', async () => {
    const clearAuth = mock(() => {});
    const setAuth = mock((_fetchToken: () => Promise<string | null>) => {});
    const setServerAuth = mock((_token: string) => {});

    await syncConvexAuthForStartLoader({
      convex: {
        convexClient: { clearAuth, setAuth },
        serverHttpClient: { setAuth: setServerAuth },
      },
      getToken: async () => 'loader-token',
    });

    expect(setAuth).toHaveBeenCalledTimes(1);
    await expect(setAuth.mock.calls[0]![0]()).resolves.toBe('loader-token');
    expect(setServerAuth).toHaveBeenCalledWith('loader-token');
  });
});
