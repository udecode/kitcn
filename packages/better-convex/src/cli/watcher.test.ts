import path from 'node:path';

import {
  getIgnoredWatchPatterns,
  getWatchPatterns,
  startWatcher,
} from './watcher';

describe('cli/watcher', () => {
  test('getWatchPatterns includes function, convex-generated-js, and router sources', () => {
    const functionsDir = '/repo/convex';
    expect(getWatchPatterns(functionsDir)).toEqual([
      path.join(functionsDir, '**', '*.ts'),
      path.join(functionsDir, '_generated', '**', '*.js'),
      path.join('/repo', 'routers', '**', '*.ts'),
    ]);
  });

  test('getIgnoredWatchPatterns excludes better-convex outputs', () => {
    const functionsDir = '/repo/convex';
    expect(getIgnoredWatchPatterns(functionsDir, '/repo/out/api.ts')).toEqual([
      path.join(functionsDir, 'generated', '**', '*.ts'),
      path.join(functionsDir, '**', '*.runtime.ts'),
      path.join(functionsDir, 'generated.ts'),
      '/repo/out/api.ts',
    ]);
  });

  test('startWatcher debounces add/change/unlink events and calls generateMeta', async () => {
    const calls: any[] = [];
    const generateMetaStub = async (...args: any[]) => {
      calls.push(args);
    };

    let watchedPatterns: string[] | null = null;
    let watchedOptions: { ignoreInitial: boolean; ignored: string[] } | null =
      null;
    const handlers: Record<string, (...args: any[]) => void> = {};

    const watcher = {
      on(event: string, cb: (...args: any[]) => void) {
        handlers[event] = cb;
        return watcher;
      },
    };

    const watchStub = (
      patterns: string[],
      options: { ignoreInitial: boolean; ignored: string[] }
    ) => {
      watchedPatterns = patterns;
      watchedOptions = options;
      return watcher as any;
    };

    const getConvexConfigStub = (outputDir?: string) => {
      expect(outputDir).toBe('out');
      return { functionsDir: '/repo/convex', outputFile: '/repo/out/api.ts' };
    };

    await startWatcher({
      outputDir: 'out',
      debug: true,
      api: false,
      auth: true,
      debounceMs: 10,
      watch: watchStub as any,
      generateMeta: generateMetaStub as any,
      getConvexConfig: getConvexConfigStub as any,
    });

    if (!watchedOptions) throw new Error('Expected watcher to be configured');
    if (!watchedPatterns) throw new Error('Expected watcher to be configured');

    expect(watchedOptions as unknown).toEqual({
      ignoreInitial: true,
      ignored: getIgnoredWatchPatterns('/repo/convex', '/repo/out/api.ts'),
    });
    expect(watchedPatterns as unknown).toEqual(
      getWatchPatterns('/repo/convex')
    );
    expect(typeof handlers.add).toBe('function');
    expect(typeof handlers.change).toBe('function');
    expect(typeof handlers.unlink).toBe('function');

    // Rapid file graph updates => one codegen call after debounce.
    handlers.add();
    handlers.change();
    handlers.unlink();
    await new Promise((r) => setTimeout(r, 25));

    expect(calls).toEqual([
      ['out', { debug: true, silent: true, api: false, auth: true }],
    ]);
  });

  test('startWatcher queues a rerun when changes land during codegen', async () => {
    const calls: any[] = [];
    const pendingRuns: Array<() => void> = [];
    const generateMetaStub = (...args: any[]) => {
      calls.push(args);
      return new Promise<void>((resolve) => {
        pendingRuns.push(resolve);
      });
    };

    const handlers: Record<string, (...args: any[]) => void> = {};
    const watcher = {
      on(event: string, cb: (...args: any[]) => void) {
        handlers[event] = cb;
        return watcher;
      },
    };

    await startWatcher({
      outputDir: 'out',
      debounceMs: 10,
      watch: (() => watcher) as any,
      generateMeta: generateMetaStub as any,
      getConvexConfig: (() => ({
        functionsDir: '/repo/convex',
        outputFile: '/repo/out/api.ts',
      })) as any,
    });

    handlers.add();
    await new Promise((r) => setTimeout(r, 25));
    expect(calls).toHaveLength(1);

    handlers.change();
    await new Promise((r) => setTimeout(r, 25));
    expect(calls).toHaveLength(1);

    const finishCurrentRun = pendingRuns.shift();
    if (!finishCurrentRun) {
      throw new Error('Expected generateMeta to start');
    }
    finishCurrentRun();
    await new Promise((r) => setTimeout(r, 25));

    expect(calls).toHaveLength(2);
    expect(calls).toEqual([
      ['out', { debug: false, silent: true, api: true, auth: true }],
      ['out', { debug: false, silent: true, api: true, auth: true }],
    ]);
  });

  test('startWatcher uses BETTER_CONVEX_GENERATE_* fallbacks when options are missing', async () => {
    const prevOutputDir = process.env.BETTER_CONVEX_API_OUTPUT_DIR;
    const prevDebug = process.env.BETTER_CONVEX_DEBUG;
    const prevGenerateApi = process.env.BETTER_CONVEX_GENERATE_API;
    const prevGenerateAuth = process.env.BETTER_CONVEX_GENERATE_AUTH;
    process.env.BETTER_CONVEX_API_OUTPUT_DIR = 'env-out';
    process.env.BETTER_CONVEX_DEBUG = '1';
    process.env.BETTER_CONVEX_GENERATE_API = '0';
    process.env.BETTER_CONVEX_GENERATE_AUTH = '1';

    const calls: any[] = [];
    const generateMetaStub = async (...args: any[]) => {
      calls.push(args);
    };
    const handlers: Record<string, (...args: any[]) => void> = {};
    const watcher = {
      on(event: string, cb: (...args: any[]) => void) {
        handlers[event] = cb;
        return watcher;
      },
    };
    const watchStub = () => watcher as any;

    try {
      await startWatcher({
        debounceMs: 10,
        watch: watchStub as any,
        generateMeta: generateMetaStub as any,
        getConvexConfig: () => ({
          functionsDir: '/repo/convex',
          outputFile: '/repo/out/api.ts',
        }),
      });

      handlers.add();
      await new Promise((r) => setTimeout(r, 25));

      expect(calls).toEqual([
        ['env-out', { debug: true, silent: true, api: false, auth: true }],
      ]);
    } finally {
      process.env.BETTER_CONVEX_API_OUTPUT_DIR = prevOutputDir;
      process.env.BETTER_CONVEX_DEBUG = prevDebug;
      process.env.BETTER_CONVEX_GENERATE_API = prevGenerateApi;
      process.env.BETTER_CONVEX_GENERATE_AUTH = prevGenerateAuth;
    }
  });
});
