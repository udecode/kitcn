import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMeta, getConvexConfig } from './codegen.js';

export function getWatchPatterns(functionsDir: string): string[] {
  // Watch function source files + HTTP route sources.
  // Note: routers/ is sibling to functions/, not inside it.
  const convexDir = path.dirname(functionsDir);
  return [
    path.join(functionsDir, '**', '*.ts'),
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
      // fall through to CSV parsing
    }
  }

  return parseFromArray(trimmed.split(','));
}

export async function startWatcher(opts?: {
  sharedDir?: string;
  debug?: boolean;
  scope?: 'all' | 'auth' | 'orm';
  trimSegments?: string[];
  debounceMs?: number;
  watch?: (
    patterns: string[],
    options: { ignoreInitial: boolean }
  ) => { on: (event: string, cb: (...args: any[]) => void) => any };
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

  const { functionsDir } = resolveConfig(sharedDir);
  const watchPatterns = getWatchPatterns(functionsDir);

  const watch = opts?.watch ?? (await import('chokidar')).watch;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(watchPatterns, { ignoreInitial: true })
    .on('change', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
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
        runGenerateMeta(sharedDir, generateOptions);
      }, debounceMs);
    })
    .on('error', (err: unknown) => console.error('Watch error:', err));
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  startWatcher().catch((error) => {
    console.error('Watch error:', error);
    process.exitCode = 1;
  });
}
