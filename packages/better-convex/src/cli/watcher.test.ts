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

    const getConvexConfigStub = (outputDir?: string) => {
      expect(outputDir).toBe('out');
      return { functionsDir: '/repo/convex', outputFile: '/repo/out/api.ts' };
    };

    await startWatcher({
      outputDir: 'out',
      debug: true,
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

    expect(calls).toEqual([['out', { debug: true, silent: true }]]);
  });
});
