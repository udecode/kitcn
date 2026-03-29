import { describe, expect, test } from 'bun:test';
import { normalizeConvexCommandResult } from './convex-command';

describe('cli/convex-command', () => {
  test('normalizeConvexCommandResult strips generic Convex nags from output', () => {
    const result = normalizeConvexCommandResult({
      exitCode: 0,
      stdout: [
        'Run `npx convex login` at any time to create an account and link this deployment.',
        'A minor update is available for Convex (1.33.0 → 1.34.0)',
        'Changelog: https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md#changelog',
        'real stdout line',
      ].join('\n'),
      stderr: [
        'Run `npx convex login` at any time to create an account and link this deployment.',
        'real stderr line',
      ].join('\n'),
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: 'real stdout line',
      stderr: 'real stderr line',
    });
  });
});
