import { describe, expect, test } from 'bun:test';
import {
  applyPinnedVersionsToPackageJson,
  getMinimumVersionRange,
  parseDependencyPinsArgs,
} from './dependency-pins';

describe('tooling/dependency-pins', () => {
  test('parses sync and upgrade commands', () => {
    expect(parseDependencyPinsArgs(['sync'])).toEqual({
      command: 'sync',
      dependency: undefined,
      skipValidate: false,
      version: undefined,
    });

    expect(parseDependencyPinsArgs(['sync', '--skip-validate'])).toEqual({
      command: 'sync',
      dependency: undefined,
      skipValidate: true,
      version: undefined,
    });

    expect(parseDependencyPinsArgs(['upgrade', 'convex', '1.33.0'])).toEqual({
      command: 'upgrade',
      dependency: 'convex',
      skipValidate: false,
      version: '1.33.0',
    });
  });

  test('derives the minimum major.minor range for convex peers', () => {
    expect(getMinimumVersionRange('1.33.0')).toBe('>=1.33');
    expect(getMinimumVersionRange('2.4.7')).toBe('>=2.4');
  });

  test('applies pinned versions to package.json dependency maps', () => {
    expect(
      applyPinnedVersionsToPackageJson(
        {
          dependencies: {
            '@tanstack/react-query': '^5.90.21',
            convex: '^1.32.0',
            hono: '^4.12.8',
          },
          devDependencies: {
            'better-auth': '1.5.5',
          },
          peerDependencies: {
            convex: '>=1.32',
            'better-auth': '^1.5.0',
          },
        },
        {
          dependencies: {
            '@tanstack/react-query': '5.95.2',
            convex: '^1.33.0',
            hono: '4.12.9',
          },
          devDependencies: {
            'better-auth': '1.4.9',
          },
          peerDependencies: {
            convex: '>=1.33',
            'better-auth': '1.4.9',
          },
        }
      )
    ).toEqual({
      dependencies: {
        '@tanstack/react-query': '5.95.2',
        convex: '^1.33.0',
        hono: '4.12.9',
      },
      devDependencies: {
        'better-auth': '1.4.9',
      },
      peerDependencies: {
        convex: '>=1.33',
        'better-auth': '1.4.9',
      },
    });
  });
});
