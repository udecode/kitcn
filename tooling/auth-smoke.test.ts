import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildCookieHeader,
  parseAuthSmokeArgs,
  resolveAuthSmokeBaseUrl,
  runAuthSmoke,
} from './auth-smoke';

describe('tooling/auth-smoke', () => {
  test('parseAuthSmokeArgs accepts a scenario target or explicit url', () => {
    expect(parseAuthSmokeArgs([])).toEqual({
      target: undefined,
      url: undefined,
    });
    expect(parseAuthSmokeArgs(['next-auth'])).toEqual({
      target: 'next-auth',
      url: undefined,
    });
    expect(parseAuthSmokeArgs(['--url', 'http://localhost:4010'])).toEqual({
      target: undefined,
      url: 'http://localhost:4010',
    });
    expect(
      parseAuthSmokeArgs(['next-auth', '--url', 'http://localhost:4010'])
    ).toEqual({
      target: 'next-auth',
      url: 'http://localhost:4010',
    });
  });

  test('resolveAuthSmokeBaseUrl prefers explicit url then scenario env file', () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'kitcn-auth-smoke-'));

    try {
      const scenarioDir = path.join(
        rootDir,
        'tmp',
        'scenarios',
        'next-auth',
        'project'
      );
      mkdirSync(scenarioDir, { recursive: true });
      writeFileSync(
        path.join(scenarioDir, '.env.local'),
        'NEXT_PUBLIC_SITE_URL=http://localhost:3005\n'
      );

      expect(
        resolveAuthSmokeBaseUrl({
          projectRoot: rootDir,
          target: 'next-auth',
        })
      ).toBe('http://localhost:3005');
      expect(
        resolveAuthSmokeBaseUrl({
          projectRoot: rootDir,
          target: 'next-auth',
          url: 'http://localhost:4010/',
        })
      ).toBe('http://localhost:4010');
      expect(
        resolveAuthSmokeBaseUrl({
          projectRoot: rootDir,
          target: 'http://localhost:4020/',
        })
      ).toBe('http://localhost:4020');
      expect(
        resolveAuthSmokeBaseUrl({
          projectRoot: rootDir,
          target: 'missing-scenario',
        })
      ).toBe('http://localhost:3005');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  test('buildCookieHeader keeps only cookie pairs', () => {
    expect(
      buildCookieHeader([
        'session_token=abc; Path=/; HttpOnly',
        'other=value; Path=/',
      ])
    ).toBe('session_token=abc; other=value');
    expect(buildCookieHeader([])).toBeNull();
  });

  test('runAuthSmoke retries transient site proxy failures', async () => {
    const calls: string[] = [];
    let signedUpEmail: string | undefined;

    const jsonResponse = (body: unknown, cookie?: string) =>
      ({
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? 'application/json'
              : name.toLowerCase() === 'set-cookie'
                ? (cookie ?? null)
                : null,
          getSetCookie: () => (cookie ? [cookie] : []),
        },
        json: async () => body,
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
      }) as Response;

    const fetchFn = (async (input, init) => {
      const requestUrl =
        input instanceof URL ? input : new URL(input.toString());
      calls.push(requestUrl.pathname);

      if (calls.length === 1) {
        return new Response('Local site proxy error: fetch failed', {
          status: 502,
        });
      }

      if (requestUrl.pathname === '/api/auth/sign-up/email') {
        const body = JSON.parse(String(init?.body)) as {
          email: string;
        };
        signedUpEmail = body.email;

        return jsonResponse(
          {
            token: 'smoke-token',
            user: {
              email: signedUpEmail,
            },
          },
          'session_token=abc; Path=/; HttpOnly'
        );
      }

      return jsonResponse({
        user: {
          email: signedUpEmail,
        },
      });
    }) as typeof fetch;

    await runAuthSmoke(['--url', 'http://localhost:3005'], {
      attempts: 2,
      fetchFn,
      logFn: () => {},
      retryDelayMs: 0,
    });

    expect(calls).toEqual([
      '/api/auth/sign-up/email',
      '/api/auth/sign-up/email',
      '/api/auth/get-session',
    ]);
  });
});
