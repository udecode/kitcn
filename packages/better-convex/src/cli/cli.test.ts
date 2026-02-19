import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isEntryPoint, parseArgs, run } from './cli';

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
    });

    expect(parseArgs(['--debug', '--api', 'out/dir'])).toEqual({
      command: 'dev',
      restArgs: [],
      convexArgs: [],
      debug: true,
      outputDir: 'out/dir',
    });

    expect(
      parseArgs(['--debug', '--api', 'out', 'codegen', '--foo', 'bar'])
    ).toEqual({
      command: 'codegen',
      restArgs: ['--foo', 'bar'],
      convexArgs: ['--foo', 'bar'],
      debug: true,
      outputDir: 'out',
    });
  });

  test('run(codegen) calls generateMeta first and then invokes convex codegen with filtered args', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});

    const exitCode = await run(
      ['--debug', '--api', 'custom/out', 'codegen', '--prod'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(generateMetaStub).toHaveBeenCalledWith('custom/out', {
      debug: true,
    });
    expect(calls).toEqual([
      {
        cmd: 'node',
        args: ['/fake/convex/main.js', 'codegen', '--prod'],
      },
    ]);
  });

  test('run(env sync) delegates to syncEnv and does not call convex', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});

    const exitCode = await run(['env', 'sync', '--auth', '--force', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
    });

    expect(exitCode).toBe(0);
    expect(syncEnvStub).toHaveBeenCalledWith({
      auth: true,
      force: true,
      prod: true,
    });
    expect(execaStub).not.toHaveBeenCalled();
  });

  test('run(env get) passes through to convex env with filtered args and preserves exitCode', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 7 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});

    const exitCode = await run(
      ['--debug', 'env', 'get', 'FOO', '--api', 'ignored'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
      }
    );

    expect(exitCode).toBe(7);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'env', 'get', 'FOO'] },
    ]);
  });

  test('run(pass-through) does not forward better-convex flags to convex', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});

    const exitCode = await run(
      ['deploy', '--debug', '--api', 'out', '--prod'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'deploy', '--prod'] },
    ]);
  });

  test('run(dev) spawns watcher + convex dev and cleans up processes when one exits', async () => {
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

      const exitCode = await run(['--debug', '--api', 'out'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
      });

      expect(exitCode).toBe(9);
      expect(generateMetaStub).toHaveBeenCalledWith('out', { debug: true });

      expect(calls.length).toBe(2);
      expect(calls[0].cmd).toBe('bun');
      expect(Array.isArray(calls[0].args)).toBe(true);
      expect((calls[0].args[0] as string).endsWith('/watcher.ts')).toBe(true);
      expect(calls[0].opts?.env?.BETTER_CONVEX_API_OUTPUT_DIR).toBe('out');
      expect(calls[0].opts?.env?.BETTER_CONVEX_DEBUG).toBe('1');

      expect(calls[1]).toEqual({
        cmd: 'node',
        args: ['/fake/convex/main.js', 'dev'],
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
