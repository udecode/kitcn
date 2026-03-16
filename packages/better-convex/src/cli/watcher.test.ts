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
    const calls: unknown[][] = [];
    const generateMetaStub = async (...args: unknown[]) => {
      calls.push(args);
    };

    let watchedPatterns: string[] | null = null;
    let watchedOptions: { ignoreInitial: boolean; ignored: string[] } | null =
      null;
    const handlers: Record<string, (...args: unknown[]) => void> = {};

    const watcher = {
      on(event: string, cb: (...args: unknown[]) => void) {
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
      return watcher;
    };

    const getConvexConfigStub = (sharedDir?: string) => {
      expect(sharedDir).toBe('out');
      return { functionsDir: '/repo/convex', outputFile: '/repo/out/api.ts' };
    };

    await startWatcher({
      sharedDir: 'out',
      debug: true,
      scope: 'orm',
      trimSegments: ['plugins'],
      debounceMs: 10,
      watch: watchStub,
      generateMeta: generateMetaStub as typeof generateMetaStub,
      getConvexConfig: getConvexConfigStub as typeof getConvexConfigStub,
    });

    if (!watchedOptions || !watchedPatterns) {
      throw new Error('Expected watcher to be configured');
    }

    expect(watchedOptions).toEqual({
      ignoreInitial: true,
      ignored: getIgnoredWatchPatterns('/repo/convex', '/repo/out/api.ts'),
    });
    expect(watchedPatterns).toEqual(getWatchPatterns('/repo/convex'));
    expect(typeof handlers.add).toBe('function');
    expect(typeof handlers.change).toBe('function');
    expect(typeof handlers.unlink).toBe('function');

    handlers.add();
    handlers.change();
    handlers.unlink();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(calls).toEqual([
      [
        'out',
        {
          debug: true,
          silent: true,
          scope: 'orm',
          trimSegments: ['plugins'],
        },
      ],
    ]);
  });

  test('startWatcher queues a rerun when changes land during codegen', async () => {
    const calls: unknown[][] = [];
    const pendingRuns: Array<() => void> = [];
    const generateMetaStub = (...args: unknown[]) => {
      calls.push(args);
      return new Promise<void>((resolve) => {
        pendingRuns.push(resolve);
      });
    };

    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const watcher = {
      on(event: string, cb: (...args: unknown[]) => void) {
        handlers[event] = cb;
        return watcher;
      },
    };

    await startWatcher({
      sharedDir: 'out',
      debounceMs: 10,
      watch: () => watcher,
      generateMeta: generateMetaStub as typeof generateMetaStub,
      getConvexConfig: (() => ({
        functionsDir: '/repo/convex',
        outputFile: '/repo/out/api.ts',
      })) as () => { functionsDir: string; outputFile: string },
    });

    handlers.add?.();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(calls).toHaveLength(1);

    handlers.change?.();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(calls).toHaveLength(1);

    const finishCurrentRun = pendingRuns.shift();
    if (!finishCurrentRun) {
      throw new Error('Expected generateMeta to start');
    }
    finishCurrentRun();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(calls).toEqual([
      ['out', { debug: false, silent: true, scope: 'all' }],
      ['out', { debug: false, silent: true, scope: 'all' }],
    ]);
  });

  test('startWatcher uses BETTER_CONVEX_CODEGEN_* fallbacks when options are missing', async () => {
    const prevOutputDir = process.env.BETTER_CONVEX_API_OUTPUT_DIR;
    const prevDebug = process.env.BETTER_CONVEX_DEBUG;
    const prevCodegenScope = process.env.BETTER_CONVEX_CODEGEN_SCOPE;
    const prevTrimSegments = process.env.BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS;

    process.env.BETTER_CONVEX_API_OUTPUT_DIR = 'env-out';
    process.env.BETTER_CONVEX_DEBUG = '1';
    process.env.BETTER_CONVEX_CODEGEN_SCOPE = 'orm';
    process.env.BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS =
      'plugins,generated,plugins';

    const calls: unknown[][] = [];
    const generateMetaStub = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const watcher = {
      on(event: string, cb: (...args: unknown[]) => void) {
        handlers[event] = cb;
        return watcher;
      },
    };

    try {
      await startWatcher({
        debounceMs: 10,
        watch: () => watcher,
        generateMeta: generateMetaStub as typeof generateMetaStub,
        getConvexConfig: (() => ({
          functionsDir: '/repo/convex',
          outputFile: '/repo/out/api.ts',
        })) as () => { functionsDir: string; outputFile: string },
      });

      handlers.add?.();
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(calls).toEqual([
        [
          'env-out',
          {
            debug: true,
            silent: true,
            scope: 'orm',
            trimSegments: ['plugins', 'generated'],
          },
        ],
      ]);
    } finally {
      process.env.BETTER_CONVEX_API_OUTPUT_DIR = prevOutputDir;
      process.env.BETTER_CONVEX_DEBUG = prevDebug;
      process.env.BETTER_CONVEX_CODEGEN_SCOPE = prevCodegenScope;
      process.env.BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS = prevTrimSegments;
    }
  });
});
