import { describe, expect, mock, test } from 'bun:test';

const CONVEX_CLI_ENTRY_RE = /convex[\\/]+bin[\\/]main\.js$/;

describe('cli/convex-command', () => {
  test('runLocalConvexCommand executes the real Convex CLI through node', async () => {
    const execaStub = mock(async () => ({
      exitCode: 0,
      stderr: '',
      stdout: 'ok\n',
    }));

    mock.module('execa', () => ({
      execa: execaStub,
    }));

    const { CLEARED_CONVEX_ENV, runLocalConvexCommand } = await import(
      './convex-command'
    );

    const result = await runLocalConvexCommand(
      ['run', 'generated/auth:getLatestJwks'],
      {
        cwd: '/tmp/kitcn-app',
        env: {
          FOO: 'bar',
        },
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'ok',
    });

    expect(execaStub).toHaveBeenCalledWith(
      'node',
      [
        expect.stringMatching(CONVEX_CLI_ENTRY_RE),
        'run',
        'generated/auth:getLatestJwks',
      ],
      expect.objectContaining({
        cwd: '/tmp/kitcn-app',
        env: expect.objectContaining({
          ...CLEARED_CONVEX_ENV,
          FOO: 'bar',
        }),
        reject: false,
        stdio: 'pipe',
      })
    );
  });
});
