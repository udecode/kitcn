import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildCookieHeader,
  parseAuthSmokeArgs,
  resolveAuthSmokeBaseUrl,
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
    const rootDir = mkdtempSync(
      path.join(tmpdir(), 'better-convex-auth-smoke-')
    );

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
});
