import { describe, expect, mock, test } from 'bun:test';
import { createDefaultConfig } from '../test-utils';
import { handleAggregateCommand } from './aggregate';

describe('cli/commands/aggregate', () => {
  const withConvexDeployKey = async (
    deployKey: string,
    run: () => Promise<void>
  ) => {
    const originalDeployKey = process.env.CONVEX_DEPLOY_KEY;
    process.env.CONVEX_DEPLOY_KEY = deployKey;

    try {
      await run();
    } finally {
      process.env.CONVEX_DEPLOY_KEY = originalDeployKey;
    }
  };

  test('handleAggregateCommand(backfill) forwards ambient Convex deployment env for convex backend', async () => {
    const calls: Record<string, string | undefined>[] = [];
    const execaStub = mock(
      async (
        _cmd: string,
        _args: string[],
        options?: { env?: Record<string, string | undefined> }
      ) => {
        calls.push(options?.env ?? {});
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({ scheduled: 0, targets: 0 })}\n`,
          stderr: '',
        } as any;
      }
    );
    const loadConfigStub = mock(() => {
      const config = createDefaultConfig();
      config.deploy.aggregateBackfill.wait = false;
      return config;
    });

    await withConvexDeployKey('prod:demo|secret', async () => {
      const exitCode = await handleAggregateCommand(
        ['aggregate', 'backfill', '--prod'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        CONVEX_DEPLOY_KEY: 'prod:demo|secret',
      })
    );
  });

  test('handleAggregateCommand(prune) forwards ambient Convex deployment env for convex backend', async () => {
    const calls: Record<string, string | undefined>[] = [];
    const execaStub = mock(
      async (
        _cmd: string,
        _args: string[],
        options?: { env?: Record<string, string | undefined> }
      ) => {
        calls.push(options?.env ?? {});
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({ pruned: 0 })}\n`,
          stderr: '',
        } as any;
      }
    );
    const loadConfigStub = mock(() => createDefaultConfig());

    await withConvexDeployKey('prod:demo|secret', async () => {
      const exitCode = await handleAggregateCommand(
        ['aggregate', 'prune', '--prod'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        CONVEX_DEPLOY_KEY: 'prod:demo|secret',
      })
    );
  });
});
