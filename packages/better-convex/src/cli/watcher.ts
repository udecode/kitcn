import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMeta, getConvexConfig } from './codegen.js';
import { logger } from './utils/logger.js';

type WatcherLike = {
  on: (event: string, cb: (...args: unknown[]) => void) => WatcherLike;
};

export function getWatchPatterns(functionsDir: string): string[] {
  // Watch function source files + Convex generated inputs.
  // Note: routers/ is sibling to functions/, not inside it.
  const convexDir = path.dirname(functionsDir);
  return [
    path.join(functionsDir, '**', '*.ts'),
    path.join(functionsDir, '_generated', '**', '*.js'),
    path.join(convexDir, 'routers', '**', '*.ts'),
  ];
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

export function getIgnoredWatchPatterns(
  functionsDir: string,
  outputFile: string
): string[] {
  return [
    path.join(functionsDir, 'generated', '**', '*.ts'),
    path.join(functionsDir, '**', '*.runtime.ts'),
    path.join(functionsDir, 'generated.ts'),
    outputFile,
  ];
}

export async function startWatcher(opts?: {
  sharedDir?: string;
  debug?: boolean;
  scope?: 'all' | 'auth' | 'orm';
  trimSegments?: string[];
  debounceMs?: number;
  watch?: (
    patterns: string[],
    options: { ignoreInitial: boolean; ignored: string[] }
  ) => WatcherLike;
  generateMeta?: typeof generateMeta;
  getConvexConfig?: typeof getConvexConfig;
}) {
  const sharedDir =
    opts?.sharedDir ?? (process.env.BETTER_CONVEX_API_OUTPUT_DIR || undefined);
  const debug = opts?.debug ?? process.env.BETTER_CONVEX_DEBUG === '1';
  const scope =
    opts?.scope ??
    (process.env.BETTER_CONVEX_CODEGEN_SCOPE as
      | 'all'
      | 'auth'
      | 'orm'
      | undefined) ??
    'all';
  const trimSegments =
    opts?.trimSegments ??
    parseTrimSegmentsEnv(process.env.BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS);
  const debounceMs = opts?.debounceMs ?? 100;
  const resolveConfig = opts?.getConvexConfig ?? getConvexConfig;
  const runGenerateMeta = opts?.generateMeta ?? generateMeta;

  const { functionsDir, outputFile } = resolveConfig(sharedDir);
  const watchPatterns = getWatchPatterns(functionsDir);
  const ignoredWatchPatterns = getIgnoredWatchPatterns(
    functionsDir,
    outputFile
  );

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

  watch(watchPatterns, {
    ignoreInitial: true,
    ignored: ignoredWatchPatterns,
  })
    .on('add', scheduleGenerateMeta)
    .on('change', scheduleGenerateMeta)
    .on('unlink', scheduleGenerateMeta)
    .on('error', (err: unknown) => logger.error('Watch error:', err));
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
