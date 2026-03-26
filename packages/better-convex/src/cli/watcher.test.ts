import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getWatchRoots, shouldIgnoreWatchPath, startWatcher } from './watcher';

describe('cli/watcher', () => {
  test('getWatchRoots includes the functions dir and sibling routers dir', () => {
    const functionsDir = '/repo/convex';
    expect(getWatchRoots(functionsDir)).toEqual([
      functionsDir,
      path.join('/repo', 'routers'),
    ]);
  });

  test('shouldIgnoreWatchPath excludes better-convex outputs', () => {
    const functionsDir = '/repo/convex';
    const outputFile = '/repo/out/api.ts';

    expect(
      shouldIgnoreWatchPath(
        '/repo/convex/generated/auth.ts',
        functionsDir,
        outputFile
      )
    ).toBe(true);
    expect(
      shouldIgnoreWatchPath(
        '/repo/convex/foo.runtime.ts',
        functionsDir,
        outputFile
      )
    ).toBe(true);
    expect(
      shouldIgnoreWatchPath(
        '/repo/convex/generated.ts',
        functionsDir,
        outputFile
      )
    ).toBe(true);
    expect(shouldIgnoreWatchPath(outputFile, functionsDir, outputFile)).toBe(
      true
    );
    expect(
      shouldIgnoreWatchPath(
        '/repo/convex/myFunctions.ts',
        functionsDir,
        outputFile
      )
    ).toBe(false);
  });

  test('startWatcher debounces add/change/unlink events and calls generateMeta', async () => {
    const calls: unknown[][] = [];
    const generateMetaStub = async (...args: unknown[]) => {
      calls.push(args);
    };

    let watchedPatterns: string[] | null = null;
    let watchedOptions: {
      ignoreInitial: boolean;
      ignored: (watchedPath: string) => boolean;
    } | null = null;
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

    expect(watchedOptions.ignoreInitial).toBe(true);
    expect(watchedPatterns).toEqual(getWatchRoots('/repo/convex'));
    expect(watchedOptions.ignored('/repo/convex/generated/auth.ts')).toBe(true);
    expect(watchedOptions.ignored('/repo/convex/myFunctions.ts')).toBe(false);
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

  test('startWatcher logs a concise success line after change-triggered codegen', async () => {
    const infoMessages: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoMessages.push(args.join(' '));
    };

    const generateMetaStub = async () => {};
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const watcher = {
      on(event: string, cb: (...args: unknown[]) => void) {
        handlers[event] = cb;
        return watcher;
      },
    };

    try {
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

      handlers.change?.();
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(
        infoMessages.some((line) => line.includes('Convex api updated'))
      ).toBe(true);
    } finally {
      console.info = originalInfo;
    }
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

  test('startWatcher reacts to a real file change with chokidar v5', async () => {
    const tempDir = await mkdtemp(
      path.join(tmpdir(), 'better-convex-watcher-')
    );
    const functionsDir = path.join(tempDir, 'convex');
    const sharedDir = path.join(functionsDir, 'shared');
    const outputFile = path.join(sharedDir, 'api.ts');
    const sourceFile = path.join(functionsDir, 'myFunctions.ts');

    await mkdir(sharedDir, { recursive: true });
    await writeFile(outputFile, '// generated\n');
    await writeFile(sourceFile, 'export const value = 1;\n');

    const calls: unknown[][] = [];
    let resolveCall: (() => void) | null = null;
    const called = new Promise<void>((resolve) => {
      resolveCall = resolve;
    });

    const watcher = await startWatcher({
      debounceMs: 20,
      generateMeta: (async (...args: unknown[]) => {
        calls.push(args);
        resolveCall?.();
      }) as typeof import('./codegen').generateMeta,
      getConvexConfig: (() => ({
        functionsDir,
        outputFile,
      })) as () => { functionsDir: string; outputFile: string },
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await writeFile(sourceFile, 'export const value = 2;\n');

      await Promise.race([
        called,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('watcher did not react')), 2000)
        ),
      ]);

      expect(calls).toEqual([
        [undefined, { debug: false, silent: true, scope: 'all' }],
      ]);
    } finally {
      await watcher.close?.();
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
