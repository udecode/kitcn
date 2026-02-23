import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isEntryPoint, parseArgs, run } from './cli';

function createDefaultConfig() {
  return {
    api: true,
    auth: true,
    outputDir: 'convex/shared',
    dev: {
      debug: false,
      convexArgs: [],
    },
    codegen: {
      debug: false,
      convexArgs: [],
    },
  };
}

describe('cli/cli', () => {
  test('isEntryPoint treats symlinked bin shims as the entrypoint', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-entrypoint-')
    );
    const target = path.join(tmpDir, 'target.mjs');
    const link = path.join(tmpDir, 'link');

    fs.writeFileSync(target, 'export {};');
    fs.symlinkSync(target, link);

    expect(isEntryPoint(link, target)).toBe(true);
    expect(isEntryPoint(target, target)).toBe(true);

    const other = path.join(tmpDir, 'other.mjs');
    fs.writeFileSync(other, 'export {};');
    expect(isEntryPoint(link, other)).toBe(false);
  });

  test('parseArgs defaults to dev and strips better-convex flags anywhere', () => {
    expect(parseArgs([])).toEqual({
      command: 'dev',
      restArgs: [],
      convexArgs: [],
      debug: false,
      outputDir: undefined,
      scope: undefined,
      configPath: undefined,
    });

    expect(
      parseArgs([
        '--debug',
        '--api',
        'out/dir',
        '--scope',
        'auth',
        '--config',
        './better-convex.config.json',
      ])
    ).toEqual({
      command: 'dev',
      restArgs: [],
      convexArgs: [],
      debug: true,
      outputDir: 'out/dir',
      scope: 'auth',
      configPath: './better-convex.config.json',
    });

    expect(
      parseArgs([
        '--debug',
        '--api',
        'out',
        'codegen',
        '--scope',
        'orm',
        '--foo',
        'bar',
      ])
    ).toEqual({
      command: 'codegen',
      restArgs: ['--foo', 'bar'],
      convexArgs: ['--foo', 'bar'],
      debug: true,
      outputDir: 'out',
      scope: 'orm',
      configPath: undefined,
    });
  });

  test('parseArgs throws for invalid --scope value', () => {
    expect(() => parseArgs(['--scope', 'bad'])).toThrow(
      'Invalid --scope value "bad". Expected one of: all, auth, orm.'
    );
  });

  test('parseArgs throws for missing --config value', () => {
    expect(() => parseArgs(['--config'])).toThrow(
      'Missing value for --config.'
    );
  });

  test('run(codegen) calls generateMeta first and then invokes convex codegen with merged args', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      outputDir: 'config/out',
      codegen: {
        debug: false,
        convexArgs: ['--team', 'acme'],
        scope: 'orm' as const,
      },
    }));

    const exitCode = await run(
      [
        '--debug',
        '--api',
        'custom/out',
        '--scope',
        'auth',
        '--config',
        './custom-config.json',
        'codegen',
        '--prod',
      ],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(loadConfigStub).toHaveBeenCalledWith('./custom-config.json');
    expect(generateMetaStub).toHaveBeenCalledWith('custom/out', {
      debug: true,
      scope: 'auth',
    });
    expect(calls).toEqual([
      {
        cmd: 'node',
        args: ['/fake/convex/main.js', 'codegen', '--team', 'acme', '--prod'],
      },
    ]);
  });

  test('run(codegen) derives scope from api/auth config when scope is missing', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      api: false,
      auth: false,
    }));

    const exitCode = await run(['codegen'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(generateMetaStub).toHaveBeenCalledWith('convex/shared', {
      debug: false,
      scope: 'orm',
    });
  });

  test('run(codegen) uses direct api/auth toggles for api-only mode', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      auth: false,
    }));

    const exitCode = await run(['codegen'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(generateMetaStub).toHaveBeenCalledWith('convex/shared', {
      debug: false,
      api: true,
      auth: false,
    });
  });

  test('run(env sync) delegates to syncEnv and does not call convex', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['env', 'sync', '--auth', '--force', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(syncEnvStub).toHaveBeenCalledWith({
      auth: true,
      force: true,
      prod: true,
    });
    expect(execaStub).not.toHaveBeenCalled();
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(env get) passes through to convex env with filtered args and preserves exitCode', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 7 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['--debug', 'env', 'get', 'FOO', '--api', 'ignored'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(7);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'env', 'get', 'FOO'] },
    ]);
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(pass-through) does not forward better-convex flags to convex', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['deploy', '--debug', '--api', 'out', '--prod'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'deploy', '--prod'] },
    ]);
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(dev) rejects --scope and instructs using codegen --scope', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['--scope', 'orm'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
    );

    expect(generateMetaStub).not.toHaveBeenCalled();
    expect(execaStub).not.toHaveBeenCalled();
  });

  test('run(dev) uses config toggles and merged convex args', async () => {
    const calls: { cmd: string; args: string[]; opts?: any }[] = [];

    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    try {
      const watcherProcess: any = new Promise(() => {});
      watcherProcess.killed = false;
      watcherProcess.kill = mock((signal?: string) => {
        watcherProcess.killed = true;
        watcherProcess.lastSignal = signal;
      });

      const convexProcess: any = Promise.resolve({ exitCode: 9 });
      convexProcess.killed = false;
      convexProcess.kill = mock((signal?: string) => {
        convexProcess.killed = true;
        convexProcess.lastSignal = signal;
      });

      const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
        calls.push({ cmd, args, opts });
        if (cmd === 'bun') return watcherProcess;
        return convexProcess;
      });
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => ({
        ...createDefaultConfig(),
        api: false,
        auth: true,
        dev: {
          debug: false,
          convexArgs: ['--team', 'cfg-team'],
        },
      }));

      const exitCode = await run(['--debug', '--api', 'out', 'dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(9);
      expect(generateMetaStub).toHaveBeenCalledWith('out', {
        debug: true,
        api: false,
        auth: true,
      });

      expect(calls.length).toBe(2);
      expect(calls[0].cmd).toBe('bun');
      expect(Array.isArray(calls[0].args)).toBe(true);
      expect((calls[0].args[0] as string).endsWith('/watcher.ts')).toBe(true);
      expect(calls[0].opts?.env?.BETTER_CONVEX_API_OUTPUT_DIR).toBe('out');
      expect(calls[0].opts?.env?.BETTER_CONVEX_DEBUG).toBe('1');
      expect(calls[0].opts?.env?.BETTER_CONVEX_GENERATE_API).toBe('0');
      expect(calls[0].opts?.env?.BETTER_CONVEX_GENERATE_AUTH).toBe('1');

      expect(calls[1]).toEqual({
        cmd: 'node',
        args: ['/fake/convex/main.js', 'dev', '--team', 'cfg-team', '--once'],
        opts: {
          stdio: 'inherit',
          cwd: process.cwd(),
          reject: false,
        },
      });

      expect(watcherProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(convexProcess.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      onSpy.mockRestore();
    }
  });
});
