import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMeta, getConvexConfig } from './codegen.js';
import { logger } from './utils/logger.js';

type WatcherLike = {
  on: (event: string, cb: (...args: unknown[]) => void) => WatcherLike;
  close?: () => Promise<void> | void;
};

type WatchOptions = {
  ignoreInitial: boolean;
  ignored: (watchedPath: string) => boolean;
};

export function getWatchRoots(functionsDir: string): string[] {
  // Watch the real roots. chokidar v5 dropped glob support.
  const convexDir = path.dirname(functionsDir);
  return [functionsDir, path.join(convexDir, 'routers')];
}

function parseTrimSegmentsEnv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parseFromArray = (segments: string[]) => {
    const normalized = [
      ...new Set(
        segments.map((segment) => segment.trim()).filter((segment) => segment)
      ),
    ];
    return normalized.length > 0 ? normalized : undefined;
  };

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((segment) => typeof segment === 'string')
      ) {
        return parseFromArray(parsed);
      }
    } catch {
      // Fall through to CSV parsing.
    }
  }

  return parseFromArray(trimmed.split(','));
}

export function shouldIgnoreWatchPath(
  watchedPath: string,
  functionsDir: string,
  outputFile: string
): boolean {
  const normalizedPath = path.resolve(watchedPath);
  const normalizedFunctionsDir = path.resolve(functionsDir);
  const normalizedOutputFile = path.resolve(outputFile);
  const generatedDir = path.join(normalizedFunctionsDir, 'generated');
  const generatedFile = path.join(normalizedFunctionsDir, 'generated.ts');

  if (normalizedPath === normalizedOutputFile) {
    return true;
  }

  if (normalizedPath === generatedFile) {
    return true;
  }

  if (
    normalizedPath === generatedDir ||
    normalizedPath.startsWith(`${generatedDir}${path.sep}`)
  ) {
    return true;
  }

  return normalizedPath.endsWith('.runtime.ts');
}

export async function startWatcher(opts?: {
  sharedDir?: string;
  debug?: boolean;
  scope?: 'all' | 'auth' | 'orm';
  trimSegments?: string[];
  debounceMs?: number;
  watch?: (patterns: string[], options: WatchOptions) => WatcherLike;
  generateMeta?: typeof generateMeta;
  getConvexConfig?: typeof getConvexConfig;
}): Promise<WatcherLike> {
  const sharedDir =
    opts?.sharedDir ?? (process.env.KITCN_API_OUTPUT_DIR || undefined);
  const debug = opts?.debug ?? process.env.KITCN_DEBUG === '1';
  const scope =
    opts?.scope ??
    (process.env.KITCN_CODEGEN_SCOPE as 'all' | 'auth' | 'orm' | undefined) ??
    'all';
  const trimSegments =
    opts?.trimSegments ??
    parseTrimSegmentsEnv(process.env.KITCN_CODEGEN_TRIM_SEGMENTS);
  const debounceMs = opts?.debounceMs ?? 100;
  const resolveConfig = opts?.getConvexConfig ?? getConvexConfig;
  const runGenerateMeta = opts?.generateMeta ?? generateMeta;

  const { functionsDir, outputFile } = resolveConfig(sharedDir);
  const watchRoots = getWatchRoots(functionsDir);

  const watch = opts?.watch ?? (await import('chokidar')).watch;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let generateMetaInFlight = false;
  let generateMetaQueued = false;

  const createGenerateOptions = (): {
    debug: boolean;
    silent: boolean;
    scope: 'all' | 'auth' | 'orm';
    trimSegments?: string[];
  } => {
    const generateOptions: {
      debug: boolean;
      silent: boolean;
      scope: 'all' | 'auth' | 'orm';
      trimSegments?: string[];
    } = {
      debug,
      silent: true,
      scope,
    };

    if (trimSegments && trimSegments.length > 0) {
      generateOptions.trimSegments = trimSegments;
    }

    return generateOptions;
  };

  const runGenerateMetaSafely = async () => {
    if (generateMetaInFlight) {
      generateMetaQueued = true;
      return;
    }

    generateMetaInFlight = true;
    try {
      await runGenerateMeta(sharedDir, createGenerateOptions());
      logger.success('Convex api updated');
    } catch (error) {
      logger.error('Watch codegen error:', error);
    } finally {
      generateMetaInFlight = false;
      if (generateMetaQueued) {
        generateMetaQueued = false;
        scheduleGenerateMeta();
      }
    }
  };

  const scheduleGenerateMeta = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runGenerateMetaSafely();
    }, debounceMs);
  };

  const watcher = watch(watchRoots, {
    ignoreInitial: true,
    ignored: (watchedPath: string) =>
      shouldIgnoreWatchPath(watchedPath, functionsDir, outputFile),
  })
    .on('add', scheduleGenerateMeta)
    .on('change', scheduleGenerateMeta)
    .on('unlink', scheduleGenerateMeta)
    .on('error', (err: unknown) => logger.error('Watch error:', err));

  return watcher;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  startWatcher().catch((error) => {
    logger.error('Watch error:', error);
    process.exitCode = 1;
  });
}
