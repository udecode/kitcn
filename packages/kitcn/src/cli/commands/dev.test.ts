import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDefaultConfig } from '../test-utils';
import {
  filterDevStartupLine,
  handleDevCommand,
  resolveConcaveLocalDevContract,
  resolveConcaveLocalSiteUrl,
  resolveDevStartupRetryDelayMs,
  resolveImplicitConvexAnonymousAgentMode,
  resolveImplicitConvexRemoteDeploymentEnv,
  resolveSupportedLocalNodeEnvOverrides,
  resolveWatcherCommand,
  runDevStartupRetryLoop,
} from './dev';

function createPendingProcess() {
  let resolveExit!: (value: { exitCode: number }) => void;
  const processPromise: any = new Promise<{ exitCode: number }>((resolve) => {
    resolveExit = resolve;
  });
  processPromise.killed = false;
  processPromise.kill = mock((signal?: string) => {
    processPromise.killed = true;
    processPromise.lastSignal = signal;
  });
  return {
    process: processPromise,
    resolveExit,
  };
}

function createPersistentProcess() {
  let resolveExit!: (value: { exitCode: number }) => void;
  const stdoutListeners: Array<(chunk: string) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  const stdoutEndListeners: Array<() => void> = [];
  const stderrEndListeners: Array<() => void> = [];
  const processPromise: any = new Promise<{ exitCode: number }>((resolve) => {
    resolveExit = resolve;
  });
  processPromise.killed = false;
  processPromise.kill = mock((signal?: string) => {
    processPromise.killed = true;
    processPromise.lastSignal = signal;
  });
  processPromise.stdout = {
    on: mock((event: string, cb: ((chunk: string) => void) | (() => void)) => {
      if (event === 'data') {
        stdoutListeners.push(cb as (chunk: string) => void);
      }
      if (event === 'end' || event === 'close') {
        stdoutEndListeners.push(cb as () => void);
      }
      return processPromise.stdout;
    }),
  };
  processPromise.stderr = {
    on: mock((event: string, cb: ((chunk: string) => void) | (() => void)) => {
      if (event === 'data') {
        stderrListeners.push(cb as (chunk: string) => void);
      }
      if (event === 'end' || event === 'close') {
        stderrEndListeners.push(cb as () => void);
      }
      return processPromise.stderr;
    }),
  };

  return {
    process: processPromise,
    emitStdout(chunk: string) {
      for (const listener of stdoutListeners) {
        listener(chunk);
      }
    },
    emitStderr(chunk: string) {
      for (const listener of stderrListeners) {
        listener(chunk);
      }
    },
    endStdout() {
      for (const listener of stdoutEndListeners) {
        listener();
      }
    },
    endStderr() {
      for (const listener of stderrEndListeners) {
        listener();
      }
    },
    resolveExit,
  };
}

function isLocalUpgradePreflightCommand(args: string[]): boolean {
  return (
    args[1] === 'dev' &&
    args.includes('--local') &&
    args.includes('--skip-push') &&
    args.includes('--local-force-upgrade')
  );
}

function isConvexInitCommand(args: string[]): boolean {
  return args[1] === 'init';
}

function isRuntimeDevCommand(args: string[]): boolean {
  return args[1] === 'dev' && !args.includes('--skip-push');
}

const LOCAL_BACKEND_UPGRADE_PROMPT =
  'This deployment is using an older version of the Convex backend. Upgrade now?';

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

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
        '/repo/node_modules/kitcn/dist/cli.mjs',
        '/repo/node_modules/kitcn/dist'
      )
    ).toEqual({
      runtime: 'node',
      watcherPath: '/repo/node_modules/kitcn/dist/watcher.mjs',
    });
  });

  test('resolveSupportedLocalNodeEnvOverrides prefers a supported node from PATH', async () => {
    const execaStub = mock((cmd: string, args: string[]) => {
      if (cmd === 'which') {
        expect(args).toEqual(['-a', 'node']);
        return Promise.resolve({
          exitCode: 0,
          stdout: [
            '/opt/homebrew/bin/node',
            '/Users/test/.local/state/fnm_multishells/1/bin/node',
          ].join('\n'),
          stderr: '',
        });
      }
      if (cmd === '/opt/homebrew/bin/node') {
        return Promise.resolve({
          exitCode: 0,
          stdout: '25.8.1',
          stderr: '',
        });
      }
      if (cmd === '/Users/test/.local/state/fnm_multishells/1/bin/node') {
        return Promise.resolve({
          exitCode: 0,
          stdout: '22.22.1',
          stderr: '',
        });
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const overrides = await resolveSupportedLocalNodeEnvOverrides({
      currentNodeVersion: 'v25.8.1',
      env: {
        PATH: '/opt/homebrew/bin:/Users/test/.local/state/fnm_multishells/1/bin:/usr/bin',
      },
      execaFn: execaStub as any,
      runtimeName: 'node',
    });

    expect(overrides).toEqual({
      PATH: '/Users/test/.local/state/fnm_multishells/1/bin:/opt/homebrew/bin:/usr/bin',
    });
  });

  test('resolveConcaveLocalSiteUrl reads NEXT_PUBLIC_SITE_URL from .env.local', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-site-url-next-')
    );
    fs.writeFileSync(
      path.join(dir, '.env.local'),
      'NEXT_PUBLIC_SITE_URL=http://localhost:4010\n'
    );

    expect(resolveConcaveLocalSiteUrl(dir)).toBe('http://localhost:4010');
  });

  test('resolveConcaveLocalSiteUrl falls back to VITE_SITE_URL then localhost:3000', () => {
    const viteDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-site-url-vite-')
    );
    fs.writeFileSync(
      path.join(viteDir, '.env.local'),
      'VITE_SITE_URL=http://localhost:4020\n'
    );
    const emptyDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-site-url-empty-')
    );

    expect(resolveConcaveLocalSiteUrl(viteDir)).toBe('http://localhost:4020');
    expect(resolveConcaveLocalSiteUrl(emptyDir)).toBe('http://localhost:3000');
  });

  test('resolveImplicitConvexRemoteDeploymentEnv reads remote deployment env from .env.local only', () => {
    const remoteDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-implicit-remote-')
    );
    const localDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-implicit-local-')
    );
    const emptyDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-implicit-empty-')
    );

    fs.writeFileSync(
      path.join(remoteDir, '.env.local'),
      'CONVEX_DEPLOYMENT=dev:remote-app\nNEXT_PUBLIC_CONVEX_URL=https://example.convex.cloud\n'
    );
    fs.writeFileSync(
      path.join(localDir, '.env.local'),
      'CONVEX_DEPLOYMENT=local:demo\nNEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210\n'
    );

    expect(resolveImplicitConvexRemoteDeploymentEnv(remoteDir)).toEqual({
      CONVEX_DEPLOYMENT: 'dev:remote-app',
      CONVEX_DEPLOY_KEY: undefined,
      CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
      CONVEX_SELF_HOSTED_URL: undefined,
    });
    expect(resolveImplicitConvexRemoteDeploymentEnv(localDir)).toBeNull();
    expect(resolveImplicitConvexRemoteDeploymentEnv(emptyDir)).toBeNull();
  });

  test('resolveImplicitConvexAnonymousAgentMode detects anonymous-agent in .env.local', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-anonymous-agent-')
    );
    fs.writeFileSync(
      path.join(dir, '.env.local'),
      'CONVEX_DEPLOYMENT=anonymous-agent\n'
    );

    expect(resolveImplicitConvexAnonymousAgentMode(dir)).toBe('anonymous');
  });

  test('resolveConcaveLocalDevContract defaults concave dev to Convex local ports', () => {
    expect(resolveConcaveLocalDevContract([], 'http://localhost:3000')).toEqual(
      {
        backendArgs: [],
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

  test('filterDevStartupLine suppresses Convex nags and rewrites ready lines', () => {
    expect(
      filterDevStartupLine(
        'Run `npx convex login` at any time to create an account and link this deployment.'
      )
    ).toEqual({
      kind: 'skip',
    });

    expect(
      filterDevStartupLine(
        'A minor update is available for Convex (1.33.0 → 1.34.0)'
      )
    ).toEqual({
      kind: 'skip',
    });

    expect(
      filterDevStartupLine(
        'CONVEX_AGENT_MODE=anonymous mode is in beta, functionality may change in the future.'
      )
    ).toEqual({
      kind: 'skip',
    });

    expect(
      filterDevStartupLine(
        "3/25/2026, 8:11:05 PM [CONVEX H(GET /api/auth/convex/jwks)] [WARN] '2026-03-25T19:11:05.836Z WARN [Better Auth]: Rate limiting skipped: could not determine client IP address. If you're behind a reverse proxy, make sure to configure `trustedProxies` in your auth config.'"
      )
    ).toEqual({
      kind: 'skip',
    });

    expect(
      filterDevStartupLine('13:35:25 Convex functions ready! (1.22s)')
    ).toEqual({
      kind: 'ready',
      message: 'Convex ready',
    });

    expect(filterDevStartupLine('user function log line')).toEqual({
      kind: 'pass',
      line: 'user function log line',
    });
  });

  test('handleDevCommand(dev) preserves raw Convex dev output', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-raw-convex-logs-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const stdoutWrites: string[] = [];
    const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array
    ) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);

    const execaStub = mock((cmd: string, args: string[], _opts?: any): any => {
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (isConvexInitCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any);

      await waitFor(() =>
        execaStub.mock.calls.some((call) => {
          const [, args] = call as unknown as [string, string[]];
          return isRuntimeDevCommand(args);
        })
      );

      convexProcess.emitStdout(
        'Run `npx convex login` at any time to create an account and link this deployment.\n'
      );
      convexProcess.emitStdout(
        'A minor update is available for Convex (1.33.0 → 1.34.0)\n'
      );
      convexProcess.emitStdout(
        "3/25/2026, 8:11:05 PM [CONVEX H(GET /api/auth/convex/jwks)] [WARN] '2026-03-25T19:11:05.836Z WARN [Better Auth]: Rate limiting skipped: could not determine client IP address. If you're behind a reverse proxy, make sure to configure `trustedProxies` in your auth config.'\n"
      );
      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');
      convexProcess.resolveExit({ exitCode: 0 });

      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(stdoutWrites.join('')).toContain('npx convex login');
      expect(stdoutWrites.join('')).toContain(
        'A minor update is available for Convex'
      );
      expect(stdoutWrites.join('')).not.toContain(
        'Rate limiting skipped: could not determine client IP address'
      );
      expect(stdoutWrites.join('')).toContain(
        '13:35:25 Convex functions ready! (1.22s)'
      );
      expect(stdoutWrites.join('')).not.toContain('Convex ready');
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });

  test('handleDevCommand waits for backend stderr drain before returning a fast failure', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-failure-output-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const stderrWrites: string[] = [];
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array
    ) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

    const execaStub = mock((cmd: string, args: string[], _opts?: any): any => {
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (isConvexInitCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      let settled = false;
      const runPromise = handleDevCommand(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any).then((value) => {
        settled = true;
        return value;
      });

      await waitFor(() =>
        execaStub.mock.calls.some((call) => {
          const [, args] = call as unknown as [string, string[]];
          return isRuntimeDevCommand(args);
        })
      );

      convexProcess.resolveExit({ exitCode: 1 });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(settled).toBe(false);

      convexProcess.emitStderr(
        '✖ A local backend is still running on port 3210. Please stop it and run this command again.\n'
      );
      convexProcess.endStdout();
      convexProcess.endStderr();

      const exitCode = await runPromise;

      expect(exitCode).toBe(1);
      expect(stderrWrites.join('')).toContain(
        'A local backend is still running on port 3210'
      );
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  test('handleDevCommand prints failing local preflight output before returning', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-init-failure-output-')
    );
    const oldCwd = process.cwd();
    const stderrWrites: string[] = [];
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array
    ) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

    const execaStub = mock((_cmd: string, args: string[], _opts?: any): any => {
      if (isConvexInitCommand(args)) {
        return Promise.resolve({
          exitCode: 1,
          stdout: '',
          stderr:
            '✖ A local backend is still running on port 3210. Please stop it and run this command again.\n',
        });
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    process.chdir(dir);

    try {
      const exitCode = await handleDevCommand(['dev'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any);

      expect(exitCode).toBe(1);
      expect(stderrWrites.join('')).toContain(
        'A local backend is still running on port 3210'
      );
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(oldCwd);
      stderrSpy.mockRestore();
    }
  });

  test('handleDevCommand uses remote .env.local deployment targets instead of local bootstrap defaults', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-remote-env-local-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, '.env.local'),
      'CONVEX_DEPLOYMENT=dev:remote-app\nNEXT_PUBLIC_CONVEX_URL=https://example.convex.cloud\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const execaCalls: Array<{ cmd: string; args: string[]; opts?: any }> = [];
    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      execaCalls.push({ cmd, args, opts });
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (args[1] === 'init') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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
    const infoMessages: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoMessages.push(args.join(' '));
    };

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any);

      await waitFor(() => execaCalls.some(({ args }) => args[1] === 'dev'));

      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');
      convexProcess.resolveExit({ exitCode: 0 });

      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(execaCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            args: ['/fake/convex/main.js', 'init'],
            opts: expect.objectContaining({
              env: expect.objectContaining({
                CONVEX_DEPLOYMENT: 'dev:remote-app',
              }),
            }),
          }),
          expect.objectContaining({
            args: ['/fake/convex/main.js', 'dev', '--once'],
            opts: expect.objectContaining({
              env: expect.objectContaining({
                CONVEX_DEPLOYMENT: 'dev:remote-app',
              }),
            }),
          }),
        ])
      );
      expect(syncEnvStub).not.toHaveBeenCalled();
      expect(
        infoMessages.some((line) => line.includes('Bootstrapping local Convex'))
      ).toBe(false);
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand prefers convex init for anonymous local deployments when init succeeds', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-anonymous-agent-local-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );
    fs.writeFileSync(
      path.join(dir, '.env.local'),
      'CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const calls: Array<{ cmd: string; args: string[]; opts?: any }> = [];

    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      calls.push({ cmd, args, opts });
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (args[1] === 'init') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (
        args[1] === 'dev' &&
        args.includes('--skip-push') &&
        args.includes('--local-force-upgrade')
      ) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      await waitFor(() => calls.some(({ args }) => args[1] === 'dev'));

      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');
      convexProcess.resolveExit({ exitCode: 0 });

      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(calls[0]).toMatchObject({
        cmd: 'node',
        args: ['/fake/convex/main.js', 'init'],
        opts: {
          env: expect.objectContaining({
            CONVEX_AGENT_MODE: 'anonymous',
          }),
        },
      });
      expect(calls[2]).toMatchObject({
        cmd: 'node',
        args: ['/fake/convex/main.js', 'dev', '--once'],
        opts: {
          env: expect.objectContaining({
            CONVEX_AGENT_MODE: 'anonymous',
          }),
        },
      });
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand falls back to local upgrade preflight when convex init hits upgrade prompt', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-anonymous-agent-upgrade-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );
    fs.writeFileSync(
      path.join(dir, '.env.local'),
      'CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const calls: Array<{ cmd: string; args: string[]; opts?: any }> = [];

    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      calls.push({ cmd, args, opts });
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (args[1] === 'init') {
        return Promise.resolve({
          exitCode: 1,
          stdout: '',
          stderr: `✖ Cannot prompt for input in non-interactive terminals. (${LOCAL_BACKEND_UPGRADE_PROMPT})`,
        });
      }
      if (isLocalUpgradePreflightCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      await waitFor(() => calls.some(({ args }) => isRuntimeDevCommand(args)));

      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');
      convexProcess.resolveExit({ exitCode: 0 });

      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(calls[0]?.args).toEqual(['/fake/convex/main.js', 'init']);
      expect(calls[1]?.args).toEqual([
        '/fake/convex/main.js',
        'dev',
        '--local',
        '--once',
        '--skip-push',
        '--local-force-upgrade',
        '--typecheck',
        'disable',
        '--codegen',
        'disable',
      ]);
      expect(calls[3]?.args).toEqual(['/fake/convex/main.js', 'dev', '--once']);
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand preserves component target args in local upgrade preflight fallback', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-local-component-target-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const calls: Array<{ cmd: string; args: string[]; opts?: any }> = [];

    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      calls.push({ cmd, args, opts });
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (args[1] === 'init') {
        return Promise.resolve({
          exitCode: 1,
          stdout: '',
          stderr: `✖ Cannot prompt for input in non-interactive terminals. (${LOCAL_BACKEND_UPGRADE_PROMPT})`,
        });
      }
      if (isLocalUpgradePreflightCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(
        ['dev', '--once', '--component', 'plugins'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );
      await waitFor(() => calls.some(({ args }) => isRuntimeDevCommand(args)));

      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');
      convexProcess.resolveExit({ exitCode: 0 });

      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(calls[0]?.args).toEqual([
        '/fake/convex/main.js',
        'init',
        '--component',
        'plugins',
      ]);
      expect(calls[1]?.args).toEqual([
        '/fake/convex/main.js',
        'dev',
        '--local',
        '--once',
        '--skip-push',
        '--local-force-upgrade',
        '--typecheck',
        'disable',
        '--codegen',
        'disable',
        '--component',
        'plugins',
      ]);
      expect(calls[3]?.args).toEqual([
        '/fake/convex/main.js',
        'dev',
        '--once',
        '--component',
        'plugins',
      ]);
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand keeps explicit --env-file targets for convex dev and reuses their deployment env internally', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-explicit-env-file-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );
    fs.writeFileSync(
      path.join(dir, '.env.agent'),
      'CONVEX_DEPLOYMENT=dev:explicit-remote\nNEXT_PUBLIC_CONVEX_URL=https://example.convex.cloud\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const execaCalls: Array<{ cmd: string; args: string[]; opts?: any }> = [];
    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      execaCalls.push({ cmd, args, opts });
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (args[1] === 'init') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      dev: {
        ...createDefaultConfig().dev,
        args: ['--env-file', '.env.agent'],
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

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any);

      await waitFor(() => execaCalls.some(({ args }) => args[1] === 'dev'));

      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');
      convexProcess.resolveExit({ exitCode: 0 });

      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(execaCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            args: ['/fake/convex/main.js', 'init'],
            opts: expect.objectContaining({
              env: expect.objectContaining({
                CONVEX_DEPLOYMENT: 'dev:explicit-remote',
              }),
            }),
          }),
          expect.objectContaining({
            args: [
              '/fake/convex/main.js',
              'dev',
              '--env-file',
              '.env.agent',
              '--once',
            ],
            opts: expect.objectContaining({
              env: expect.objectContaining({
                CONVEX_DEPLOYMENT: 'dev:explicit-remote',
              }),
            }),
          }),
        ])
      );
      expect(syncEnvStub).toHaveBeenCalledWith({
        authSyncMode: 'skip',
        commandEnv: expect.objectContaining({
          CONVEX_DEPLOYMENT: 'dev:explicit-remote',
        }),
        force: true,
        sharedDir: 'convex/shared',
        silent: true,
        targetArgs: [],
      });
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand applies the concave local dev contract', async () => {
    const calls: { cmd: string; args: string[]; opts?: any }[] = [];
    const concaveCliPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-dev-concave-')),
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
        loadCliConfig: loadConfigStub as any,
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
      expect(calls[0]).toEqual(
        expect.objectContaining({
          cmd: 'bun',
          opts: expect.objectContaining({
            env: expect.objectContaining({
              KITCN_BACKEND: 'concave',
            }),
          }),
        })
      );
      expect(calls[1]).toEqual(
        expect.objectContaining({
          cmd: 'bun',
          args: [concaveCliPath, 'dev'],
          opts: expect.objectContaining({
            stdio: 'pipe',
            cwd: process.cwd(),
            env: expect.objectContaining({
              CONVEX_SITE_URL: 'http://127.0.0.1:3211',
              SITE_URL: 'http://localhost:3000',
            }),
            reject: false,
          }),
        })
      );
      expect(syncEnvStub).not.toHaveBeenCalled();
      expect(watcherProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(concaveProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(siteProxy.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand loads root .env for concave parse-time env', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-concave-root-env-')
    );
    const oldCwd = process.cwd();
    const originalSecret = process.env.SECRET;
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    const concaveCliPath = path.join(dir, 'concave.mjs');
    fs.writeFileSync(concaveCliPath, 'export {};\n');
    fs.writeFileSync(
      path.join(dir, 'convex.json'),
      `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
    );
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=from-root-env\n');

    const watcher = createPendingProcess();

    const concaveProcess = createPersistentProcess();
    const siteProxy: any = {
      killed: false,
      kill: mock(() => {
        siteProxy.killed = true;
      }),
    };
    const startLocalSiteProxyStub = mock(async () => siteProxy);

    const execaStub = mock((cmd: string, args: string[]): any => {
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcher.process;
      }
      return concaveProcess.process;
    });
    const generateMetaStub = mock(async () => {
      expect(process.env.SECRET).toBe('from-root-env');
    });
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

    process.chdir(dir);
    try {
      const exitPromise = handleDevCommand(['--backend', 'concave', 'dev'], {
        realConvex: '/fake/convex/main.js',
        realConcave: concaveCliPath,
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
        resolveConcaveLocalSiteUrl: () => 'http://localhost:3000',
        startLocalSiteProxy: startLocalSiteProxyStub as any,
      } as any);

      concaveProcess.emitStdout('Concave functions ready!\n');
      concaveProcess.endStdout();
      concaveProcess.endStderr();
      concaveProcess.resolveExit({ exitCode: 0 });
      watcher.resolveExit({ exitCode: 0 });

      const exitCode = await exitPromise;
      expect(exitCode).toBe(0);
      expect(generateMetaStub).toHaveBeenCalled();
      expect(process.env.SECRET).toBe(originalSecret);
      expect(siteProxy.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      process.chdir(oldCwd);
      if (originalSecret === undefined) {
        process.env.SECRET = undefined;
      } else {
        process.env.SECRET = originalSecret;
      }
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand prepares auth env before startup and completes auth env sync before returning', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-auth-env-sync-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'functions', 'generated'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex.json'),
      `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );
    fs.writeFileSync(
      path.join(dir, 'convex', 'functions', 'auth.ts'),
      'export default {};\n'
    );
    fs.writeFileSync(
      path.join(dir, 'convex', 'functions', 'generated', 'auth.ts'),
      'export {};\n'
    );

    const watcherProcess: any = new Promise(() => {});
    watcherProcess.killed = false;
    watcherProcess.kill = mock((signal?: string) => {
      watcherProcess.killed = true;
      watcherProcess.lastSignal = signal;
    });

    const convexProcess: any = Promise.resolve({ exitCode: 0 });
    convexProcess.killed = false;
    convexProcess.kill = mock((signal?: string) => {
      convexProcess.killed = true;
      convexProcess.lastSignal = signal;
    });

    let releaseCompleteSync!: () => void;
    const completeSyncGate = new Promise<void>((resolve) => {
      releaseCompleteSync = resolve;
    });
    let resolvePrepareSyncStarted!: () => void;
    const prepareSyncStarted = new Promise<void>((resolve) => {
      resolvePrepareSyncStarted = resolve;
    });
    let resolveCompleteSyncStarted!: () => void;
    const completeSyncStarted = new Promise<void>((resolve) => {
      resolveCompleteSyncStarted = resolve;
    });
    const syncEnvStub = mock(async (options?: Record<string, unknown>) => {
      if (options?.authSyncMode === 'prepare') {
        resolvePrepareSyncStarted();
      }
      if (options?.authSyncMode === 'complete') {
        resolveCompleteSyncStarted();
        await completeSyncGate;
      }
    });

    const execaStub = mock((cmd: string, args: string[], _opts?: any): any => {
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess;
      }
      if (isLocalUpgradePreflightCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess;
    });
    const generateMetaStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      let settled = false;
      const runPromise = handleDevCommand(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any).then((value) => {
        settled = true;
        return value;
      });

      await prepareSyncStarted;

      expect(syncEnvStub.mock.calls).toEqual([
        [
          {
            authSyncMode: 'prepare',
            force: true,
            sharedDir: 'convex/shared',
            silent: true,
            targetArgs: [],
          },
        ],
      ]);
      expect(settled).toBe(false);

      await completeSyncStarted;

      expect(syncEnvStub.mock.calls).toEqual([
        [
          {
            authSyncMode: 'prepare',
            force: true,
            sharedDir: 'convex/shared',
            silent: true,
            targetArgs: [],
          },
        ],
        [
          {
            authSyncMode: 'complete',
            force: true,
            sharedDir: 'convex/shared',
            silent: true,
            targetArgs: [],
          },
        ],
      ]);

      releaseCompleteSync();

      const exitCode = await runPromise;
      expect(exitCode).toBe(0);
      expect(watcherProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(convexProcess.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand(--bootstrap) runs one-shot local convex bootstrap without watcher', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-dev-bootstrap-'));
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex', 'functions'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex.json'),
      `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );
    fs.writeFileSync(
      path.join(dir, 'convex', 'functions', 'auth.ts'),
      'export default {};\n'
    );

    const calls: { cmd: string; args: string[]; opts?: any }[] = [];
    const convexProcess = createPersistentProcess();
    const syncEnvStub = mock(async () => {});
    const generateMetaStub = mock(
      async (
        sharedDir: string,
        options?: {
          debug?: boolean;
          scope?: 'all' | 'auth' | 'orm';
          silent?: boolean;
        }
      ) => {
        expect(options?.silent).toBe(true);
        expect(options?.scope).toBe('all');
        const generatedAuthPath = path.join(
          dir,
          sharedDir,
          '..',
          'functions',
          'generated',
          'auth.ts'
        );
        fs.mkdirSync(path.dirname(generatedAuthPath), { recursive: true });
        fs.writeFileSync(generatedAuthPath, 'export {};\n');
      }
    );
    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      calls.push({ cmd, args, opts });
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        throw new Error('bootstrap should not start watcher');
      }
      if (isConvexInitCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const infoMessages: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoMessages.push(args.join(' '));
    };

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev', '--bootstrap'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: (() => ({
          ...createDefaultConfig(),
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
        })) as any,
      } as any);
      await waitFor(() => calls.length >= 2);
      convexProcess.emitStdout(
        'Run `npx convex login` at any time to create an account and link this deployment.\n'
      );
      convexProcess.emitStdout(
        'A minor update is available for Convex (1.33.0 → 1.34.0)\n'
      );
      convexProcess.emitStdout(
        'Changelog: https://github.com/get-convex/convex-js/blob/main/CHANGELOG.md#changelog\n'
      );
      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');
      convexProcess.emitStdout('✔ Finished running function "init"\n');
      convexProcess.resolveExit({ exitCode: 0 });

      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({
        cmd: 'node',
        args: ['/fake/convex/main.js', 'init'],
        opts: expect.objectContaining({
          cwd: process.cwd(),
          reject: false,
          stdio: 'pipe',
        }),
      });
      expect(calls[1]).toEqual({
        cmd: 'node',
        args: [
          '/fake/convex/main.js',
          'dev',
          '--once',
          '--typecheck',
          'disable',
        ],
        opts: expect.objectContaining({
          cwd: process.cwd(),
          reject: false,
          stdio: 'pipe',
        }),
      });
      expect(syncEnvStub.mock.calls).toEqual([
        [
          {
            authSyncMode: 'prepare',
            force: true,
            sharedDir: 'convex/shared',
            silent: true,
            targetArgs: [],
          },
        ],
        [
          {
            authSyncMode: 'complete',
            force: true,
            sharedDir: 'convex/shared',
            silent: true,
            targetArgs: [],
          },
        ],
      ]);
      expect(
        infoMessages.some((line) => line.includes('Bootstrapping local Convex'))
      ).toBe(true);
      expect(infoMessages.some((line) => line.includes('Convex ready'))).toBe(
        true
      );
      expect(infoMessages.join('\n')).not.toContain('npx convex login');
      expect(infoMessages.join('\n')).not.toContain(
        'A minor update is available for Convex'
      );
      expect(infoMessages.join('\n')).not.toContain(
        'Finished running function "init"'
      );
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('handleDevCommand(--bootstrap) rejects backend concave', async () => {
    await expect(
      handleDevCommand(['dev', '--backend', 'concave', '--bootstrap'], {
        loadCliConfig: (() => ({
          ...createDefaultConfig(),
          backend: 'concave' as const,
        })) as any,
      } as any)
    ).rejects.toThrow(
      '`kitcn dev --bootstrap` is only supported for backend convex.'
    );
  });

  test('handleDevCommand watches convex/.env and auto-syncs local edits on backend convex', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-dev-env-watch-'));
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPendingProcess();
    const syncEnvStub = mock(async () => {});
    const execaStub = mock((cmd: string, args: string[], _opts?: any): any => {
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (isConvexInitCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any);

      await waitFor(() => syncEnvStub.mock.calls.length >= 1);
      expect(syncEnvStub.mock.calls[0]).toEqual([
        {
          authSyncMode: 'skip',
          force: true,
          sharedDir: 'convex/shared',
          silent: true,
          targetArgs: [],
        },
      ]);

      await waitFor(
        () =>
          execaStub.mock.calls.some((call) => {
            const [, args] = call as unknown as [string, string[]];
            return isRuntimeDevCommand(args);
          }),
        2000
      );
      await new Promise((resolve) => setTimeout(resolve, 120));

      fs.appendFileSync(
        path.join(dir, 'convex', '.env'),
        'FEATURE_FLAG=true\n',
        'utf8'
      );

      await waitFor(() => syncEnvStub.mock.calls.length >= 2);
      expect(syncEnvStub.mock.calls[1]).toEqual([
        {
          authSyncMode: 'auto',
          force: true,
          sharedDir: 'convex/shared',
          silent: true,
          targetArgs: [],
        },
      ]);

      convexProcess.resolveExit({ exitCode: 0 });
      const exitCode = await runPromise;
      expect(exitCode).toBe(0);
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand waits for backend readiness before aggregate backfill kickoff', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-backfill-ready-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPersistentProcess();
    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.join(' '));
    };

    const execaStub = mock((cmd: string, args: string[], _opts?: any): any => {
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (isConvexInitCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (args.includes('generated/server:aggregateBackfill')) {
        return Promise.resolve({
          exitCode: 0,
          stdout: '{"targets":0,"scheduled":0}\n',
          stderr: '',
        });
      }
      if (args.includes('generated/server:aggregateBackfillStatus')) {
        return Promise.resolve({
          exitCode: 0,
          stdout: '[]\n',
          stderr: '',
        });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      dev: {
        ...createDefaultConfig().dev,
        migrations: {
          ...createDefaultConfig().dev.migrations,
          enabled: 'off' as const,
        },
        aggregateBackfill: {
          ...createDefaultConfig().dev.aggregateBackfill,
          enabled: 'on' as const,
        },
      },
    }));

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(
        execaStub.mock.calls.some((call) => {
          const [, args] = call as unknown as [string, string[]];
          return args.includes('generated/server:aggregateBackfill');
        })
      ).toBe(false);

      convexProcess.emitStdout('13:35:25 Convex functions ready! (1.22s)\n');

      await waitFor(() =>
        execaStub.mock.calls.some((call) => {
          const [, args] = call as unknown as [string, string[]];
          return args.includes('generated/server:aggregateBackfill');
        })
      );

      convexProcess.resolveExit({ exitCode: 0 });
      const exitCode = await runPromise;

      expect(exitCode).toBe(0);
      expect(warnMessages.join('\n')).not.toContain(
        'aggregateBackfill kickoff failed in dev'
      );
    } finally {
      console.warn = originalWarn;
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });

  test('handleDevCommand ignores convex/.env follow-up events caused by sync writes', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dev-env-watch-loop-')
    );
    const oldCwd = process.cwd();
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    fs.mkdirSync(path.join(dir, 'convex', 'shared'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      'SITE_URL=http://localhost:3000\n'
    );

    const watcherProcess = createPendingProcess();
    const convexProcess = createPendingProcess();
    const syncEnvStub = mock(async (options?: Record<string, unknown>) => {
      if (options?.authSyncMode === 'auto') {
        fs.writeFileSync(
          path.join(dir, 'convex', '.env'),
          'SITE_URL=http://localhost:3000\nFEATURE_FLAG=true\nBETTER_AUTH_SECRET=generated-secret\n',
          'utf8'
        );
      }
    });
    const execaStub = mock((cmd: string, args: string[], _opts?: any): any => {
      if (cmd === 'bun' && (args[0] as string).endsWith('/watcher.ts')) {
        return watcherProcess.process;
      }
      if (isConvexInitCommand(args)) {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      return convexProcess.process;
    });
    const generateMetaStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
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

    process.chdir(dir);

    try {
      const runPromise = handleDevCommand(['dev'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      } as any);

      await waitFor(() => syncEnvStub.mock.calls.length >= 1);
      await waitFor(
        () =>
          execaStub.mock.calls.some((call) => {
            const [, args] = call as unknown as [string, string[]];
            return isRuntimeDevCommand(args);
          }),
        2000
      );
      await new Promise((resolve) => setTimeout(resolve, 120));

      fs.writeFileSync(
        path.join(dir, 'convex', '.env'),
        'SITE_URL=http://localhost:3000\nFEATURE_FLAG=true\n',
        'utf8'
      );

      await waitFor(() => syncEnvStub.mock.calls.length >= 2);
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(syncEnvStub.mock.calls).toHaveLength(2);

      convexProcess.resolveExit({ exitCode: 0 });
      const exitCode = await runPromise;
      expect(exitCode).toBe(0);
    } finally {
      process.chdir(oldCwd);
      onSpy.mockRestore();
    }
  });
});
