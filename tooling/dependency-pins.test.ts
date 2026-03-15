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
      version: undefined,
    });

    expect(parseDependencyPinsArgs(['upgrade', 'convex', '1.33.0'])).toEqual({
      command: 'upgrade',
      dependency: 'convex',
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
            convex: '^1.32.0',
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
            convex: '^1.33.0',
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
        convex: '^1.33.0',
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
