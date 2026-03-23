import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDefaultConfig } from '../test-utils';
import {
  handleDevCommand,
  resolveConcaveLocalDevContract,
  resolveConcaveLocalSiteUrl,
  resolveDevStartupRetryDelayMs,
  resolveWatcherCommand,
  runDevStartupRetryLoop,
} from './dev';

describe('cli/commands/dev', () => {
  test('resolveWatcherCommand uses the source watcher during ts execution', () => {
    expect(
      resolveWatcherCommand(
        '/repo/src/cli/commands/dev.ts',
        '/repo/src/cli/commands'
      )
    ).toEqual({
      runtime: 'bun',
      watcherPath: '/repo/src/cli/watcher.ts',
    });
  });

  test('resolveWatcherCommand uses the packaged watcher during built execution', () => {
    expect(
      resolveWatcherCommand(
        '/repo/node_modules/better-convex/dist/cli.mjs',
        '/repo/node_modules/better-convex/dist'
      )
    ).toEqual({
      runtime: process.execPath,
      watcherPath: '/repo/node_modules/better-convex/dist/watcher.mjs',
    });
  });

  test('resolveConcaveLocalSiteUrl reads NEXT_PUBLIC_SITE_URL from .env.local', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-dev-site-url-next-')
    );
    fs.writeFileSync(
      path.join(dir, '.env.local'),
      'NEXT_PUBLIC_SITE_URL=http://localhost:4010\n'
    );

    expect(resolveConcaveLocalSiteUrl(dir)).toBe('http://localhost:4010');
  });

  test('resolveConcaveLocalSiteUrl falls back to VITE_SITE_URL then localhost:3000', () => {
    const viteDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-dev-site-url-vite-')
    );
    fs.writeFileSync(
      path.join(viteDir, '.env.local'),
      'VITE_SITE_URL=http://localhost:4020\n'
    );
    const emptyDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-dev-site-url-empty-')
    );

    expect(resolveConcaveLocalSiteUrl(viteDir)).toBe('http://localhost:4020');
    expect(resolveConcaveLocalSiteUrl(emptyDir)).toBe('http://localhost:3000');
  });

  test('resolveConcaveLocalDevContract defaults concave dev to Convex local ports', () => {
    expect(resolveConcaveLocalDevContract([], 'http://localhost:3000')).toEqual(
      {
        backendArgs: ['--port', '3210'],
        targetArgs: ['--url', 'http://127.0.0.1:3210'],
        backendEnv: {
          CONVEX_SITE_URL: 'http://127.0.0.1:3211',
          SITE_URL: 'http://localhost:3000',
        },
        siteProxy: {
          listenHost: '127.0.0.1',
          listenPort: 3211,
          targetOrigin: 'http://127.0.0.1:3210',
        },
      }
    );
  });

  test('resolveDevStartupRetryDelayMs uses TanStack-style exponential backoff', () => {
    expect(resolveDevStartupRetryDelayMs(1)).toBe(1000);
    expect(resolveDevStartupRetryDelayMs(2)).toBe(2000);
    expect(resolveDevStartupRetryDelayMs(3)).toBe(4000);
    expect(resolveDevStartupRetryDelayMs(7)).toBe(30_000);
  });

  test('runDevStartupRetryLoop retries concave startup failures and logs retry numbers only', async () => {
    const calls: number[] = [];
    const sleepCalls: number[] = [];
    const infoCalls: string[] = [];
    const warnCalls: string[] = [];
    const runTask = mock(async () => {
      calls.push(Date.now());
      return calls.length < 3 ? 1 : 0;
    });

    const result = await runDevStartupRetryLoop({
      backend: 'concave',
      label: 'migration up',
      runTask,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      logger: {
        info: (...args) => {
          infoCalls.push(args.join(' '));
        },
        warn: (...args) => {
          warnCalls.push(args.join(' '));
        },
      },
    });

    expect(result).toBe(0);
    expect(runTask).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([1000, 2000]);
    expect(infoCalls).toEqual([
      '↻ migration up retry 2/4',
      '↻ migration up retry 3/4',
    ]);
    expect(warnCalls).toEqual([]);
  });

  test('runDevStartupRetryLoop does not retry convex startup failures', async () => {
    const sleepCalls: number[] = [];
    const infoCalls: string[] = [];
    const runTask = mock(async () => 1);

    const result = await runDevStartupRetryLoop({
      backend: 'convex',
      label: 'aggregateBackfill kickoff',
      runTask,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      logger: {
        info: (...args) => {
          infoCalls.push(args.join(' '));
        },
        warn: () => {},
      },
    });

    expect(result).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]);
    expect(infoCalls).toEqual([]);
  });

  test('handleDevCommand applies the concave local dev contract', async () => {
    const calls: { cmd: string; args: string[]; opts?: any }[] = [];
    const concaveCliPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-dev-concave-')),
      'concave.mjs'
    );
    fs.writeFileSync(concaveCliPath, 'export {};\n');
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    const watcherProcess: any = new Promise(() => {});
    watcherProcess.killed = false;
    watcherProcess.kill = mock((signal?: string) => {
      watcherProcess.killed = true;
      watcherProcess.lastSignal = signal;
    });

    const concaveProcess: any = Promise.resolve({ exitCode: 9 });
    concaveProcess.killed = false;
    concaveProcess.kill = mock((signal?: string) => {
      concaveProcess.killed = true;
      concaveProcess.lastSignal = signal;
    });

    const siteProxy: any = {
      killed: false,
      kill: mock((signal?: string) => {
        siteProxy.killed = true;
        siteProxy.lastSignal = signal;
      }),
    };
    const startLocalSiteProxyStub = mock(async () => siteProxy);

    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      calls.push({ cmd, args, opts });
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess;
      }
      return concaveProcess;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      backend: 'concave' as const,
      dev: {
        ...createDefaultConfig().dev,
        aggregateBackfill: {
          ...createDefaultConfig().dev.aggregateBackfill,
          enabled: 'off' as const,
        },
        migrations: {
          ...createDefaultConfig().dev.migrations,
          enabled: 'off' as const,
        },
      },
    }));

    try {
      const exitCode = await handleDevCommand(['--backend', 'concave', 'dev'], {
        realConvex: '/fake/convex/main.js',
        realConcave: concaveCliPath,
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        resolveConcaveLocalSiteUrl: () => 'http://localhost:3000',
        startLocalSiteProxy: startLocalSiteProxyStub as any,
      } as any);

      expect(exitCode).toBe(9);
      expect(startLocalSiteProxyStub).toHaveBeenCalledWith({
        listenHost: '127.0.0.1',
        listenPort: 3211,
        targetOrigin: 'http://127.0.0.1:3210',
      });
      expect(calls).toHaveLength(2);
      expect(calls[1]).toEqual({
        cmd: 'bun',
        args: [concaveCliPath, 'dev', '--port', '3210'],
        opts: {
          stdio: 'inherit',
          cwd: process.cwd(),
          env: expect.objectContaining({
            CONVEX_SITE_URL: 'http://127.0.0.1:3211',
            SITE_URL: 'http://localhost:3000',
          }),
          reject: false,
        },
      });
      expect(syncEnvStub).not.toHaveBeenCalled();
      expect(watcherProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(concaveProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(siteProxy.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      onSpy.mockRestore();
    }
  });
});
