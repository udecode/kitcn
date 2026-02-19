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

export async function startWatcher(opts?: {
  outputDir?: string;
  debug?: boolean;
  debounceMs?: number;
  watch?: (
    patterns: string[],
    options: { ignoreInitial: boolean }
  ) => { on: (event: string, cb: (...args: any[]) => void) => any };
  generateMeta?: typeof generateMeta;
  getConvexConfig?: typeof getConvexConfig;
}) {
  const outputDir =
    opts?.outputDir ?? (process.env.BETTER_CONVEX_API_OUTPUT_DIR || undefined);
  const debug = opts?.debug ?? process.env.BETTER_CONVEX_DEBUG === '1';
  const debounceMs = opts?.debounceMs ?? 100;
  const resolveConfig = opts?.getConvexConfig ?? getConvexConfig;
  const runGenerateMeta = opts?.generateMeta ?? generateMeta;

  const { functionsDir } = resolveConfig(outputDir);
  const watchPatterns = getWatchPatterns(functionsDir);

  const watch = opts?.watch ?? (await import('chokidar')).watch;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(watchPatterns, { ignoreInitial: true })
    .on('change', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        runGenerateMeta(outputDir, { debug, silent: true });
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
