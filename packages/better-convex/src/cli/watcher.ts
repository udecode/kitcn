import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMeta, getConvexConfig } from './codegen.js';

export function getWatchPatterns(functionsDir: string): string[] {
  // Watch function source files + Convex generated inputs.
  // Note: routers/ is sibling to functions/, not inside it.
  const convexDir = path.dirname(functionsDir);
  return [
    path.join(functionsDir, '**', '*.ts'),
    path.join(functionsDir, '_generated', '**', '*.ts'),
    path.join(functionsDir, '_generated', '**', '*.js'),
    path.join(convexDir, 'routers', '**', '*.ts'),
  ];
}

export async function startWatcher(opts?: {
  outputDir?: string;
  debug?: boolean;
  api?: boolean;
  auth?: boolean;
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
  const generateApi =
    opts?.api ??
    (process.env.BETTER_CONVEX_GENERATE_API
      ? process.env.BETTER_CONVEX_GENERATE_API !== '0'
      : true);
  const generateAuth =
    opts?.auth ??
    (process.env.BETTER_CONVEX_GENERATE_AUTH
      ? process.env.BETTER_CONVEX_GENERATE_AUTH !== '0'
      : true);
  const debounceMs = opts?.debounceMs ?? 100;
  const resolveConfig = opts?.getConvexConfig ?? getConvexConfig;
  const runGenerateMeta = opts?.generateMeta ?? generateMeta;

  const { functionsDir } = resolveConfig(outputDir);
  const watchPatterns = getWatchPatterns(functionsDir);

  const watch = opts?.watch ?? (await import('chokidar')).watch;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let generateMetaInFlight = false;
  let generateMetaQueued = false;

  const runGenerateMetaSafely = async () => {
    if (generateMetaInFlight) {
      generateMetaQueued = true;
      return;
    }

    generateMetaInFlight = true;
    try {
      await runGenerateMeta(outputDir, {
        debug,
        silent: true,
        api: generateApi,
        auth: generateAuth,
      });
    } catch (error) {
      console.error('Watch codegen error:', error);
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

  watch(watchPatterns, { ignoreInitial: true })
    .on('add', scheduleGenerateMeta)
    .on('change', scheduleGenerateMeta)
    .on('unlink', scheduleGenerateMeta)
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
