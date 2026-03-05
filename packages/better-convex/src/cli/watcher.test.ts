import path from 'node:path';

import { getWatchPatterns, startWatcher } from './watcher';

describe('cli/watcher', () => {
  test('getWatchPatterns includes function sources and routers/**/*.ts', () => {
    const functionsDir = '/repo/convex';
    expect(getWatchPatterns(functionsDir)).toEqual([
      path.join(functionsDir, '**', '*.ts'),
      path.join('/repo', 'routers', '**', '*.ts'),
    ]);
  });

  test('startWatcher debounces change events and calls generateMeta', async () => {
    const calls: any[] = [];
    const generateMetaStub = (...args: any[]) => {
      calls.push(args);
    };

    let watchedPatterns: string[] | null = null;
    let watchedOptions: { ignoreInitial: boolean } | null = null;
    const handlers: Record<string, (...args: any[]) => void> = {};

    const watcher = {
      on(event: string, cb: (...args: any[]) => void) {
        handlers[event] = cb;
        return watcher;
      },
    };

    const watchStub = (
      patterns: string[],
      options: { ignoreInitial: boolean }
    ) => {
      watchedPatterns = patterns;
      watchedOptions = options;
      return watcher as any;
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
      watch: watchStub as any,
      generateMeta: generateMetaStub as any,
      getConvexConfig: getConvexConfigStub as any,
    });

    if (!watchedOptions) throw new Error('Expected watcher to be configured');
    if (!watchedPatterns) throw new Error('Expected watcher to be configured');

    expect(watchedOptions as unknown).toEqual({ ignoreInitial: true });
    expect(watchedPatterns as unknown).toEqual(
      getWatchPatterns('/repo/convex')
    );
    expect(typeof handlers.change).toBe('function');

    // Two rapid changes => one codegen call after debounce.
    handlers.change();
    handlers.change();
    await new Promise((r) => setTimeout(r, 25));

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

  test('startWatcher uses BETTER_CONVEX_CODEGEN_SCOPE fallback when options are missing', async () => {
    const prevOutputDir = process.env.BETTER_CONVEX_API_OUTPUT_DIR;
    const prevDebug = process.env.BETTER_CONVEX_DEBUG;
    const prevCodegenScope = process.env.BETTER_CONVEX_CODEGEN_SCOPE;
    const prevTrimSegments = process.env.BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS;
    process.env.BETTER_CONVEX_API_OUTPUT_DIR = 'env-out';
    process.env.BETTER_CONVEX_DEBUG = '1';
    process.env.BETTER_CONVEX_CODEGEN_SCOPE = 'orm';
    process.env.BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS =
      'plugins,generated,plugins';

    const calls: any[] = [];
    const generateMetaStub = (...args: any[]) => {
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

      handlers.change();
      await new Promise((r) => setTimeout(r, 25));

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
